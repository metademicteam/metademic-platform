import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { z } from "zod";
import { validateDoiPrefix, generateDoi, buildCrossrefMetadata, queueDoiRegistration, upsertDoiRecord } from "@/lib/services/doi-service";

const schema = z.object({
  articleId: z.string().uuid(),
  prefix: z.string().optional(), // if not provided, uses journal doi_prefix
  suffixPattern: z.string().optional().nullable(),
  publicUrl: z.string().url().optional(),
});

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });

  const { articleId, prefix: overridePrefix, suffixPattern: overrideSuffixPattern, publicUrl } = parsed.data;
  const admin = createAdminClient();

  // Authorization: production/admin/editor can register DOI
  const { data: memberships } = await supabase.from("journal_members").select("role,is_active").eq("user_id", user.id).eq("is_active", true);
  const roles = (memberships ?? []).map((m: { role: string }) => m.role);
  const allowed = roles.some((r: string) => ["production_editor","copyeditor","managing_editor","journal_manager","journal_admin","super_admin","editor","editor_in_chief"].includes(r));
  if (!allowed) return NextResponse.json({ error: "Forbidden — DOI registration requires production/admin role" }, { status: 403 });

  const { data: article, error: aErr } = await admin.from("articles").select("id, title, abstract, journal_id, manuscript_id, license_url, article_number, slug").eq("id", articleId).single();
  if (aErr || !article) return NextResponse.json({ error: "Article not found" }, { status: 404 });
  const art = article as { id: string; title: string; abstract: string | null; journal_id: string; manuscript_id: string; license_url: string | null; article_number: string; slug: string };

  const { data: journal } = await admin.from("journals").select("name, short_name, doi_prefix, doi_suffix_pattern, slug, issn_print, issn_online, publisher_name, settings").eq("id", art.journal_id).single();
  if (!journal) return NextResponse.json({ error: "Journal not found" }, { status: 404 });
  const j = journal as { name: string; short_name: string | null; doi_prefix: string | null; doi_suffix_pattern: string | null; slug: string; issn_print: string | null; issn_online: string | null; publisher_name: string | null };

  const prefix = (overridePrefix ?? j.doi_prefix ?? "").trim();
  if (!prefix) return NextResponse.json({ error: "No DOI prefix configured for journal. Set journal.doi_prefix (e.g. 10.12345) or pass prefix in request." }, { status: 400 });
  try { validateDoiPrefix(prefix); } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Invalid prefix" }, { status: 400 }); }

  // Need manuscript number for suffix token
  const { data: manuscript } = await admin.from("manuscripts").select("manuscript_number").eq("id", art.manuscript_id).single();
  const manuscriptNumber = (manuscript as { manuscript_number: string } | null)?.manuscript_number;

  const { data: existingDoi } = await admin.from("doi_records").select("id, doi, registration_status").eq("article_id", articleId).maybeSingle();
  // If already registered, return it
  if (existingDoi && (existingDoi as { registration_status: string }).registration_status === "registered") {
    return NextResponse.json({ data: existingDoi, message: "DOI already registered" });
  }

  // Generate DOI
  let doi: string, doiPrefix: string, doiSuffix: string;
  try {
    const gen = await generateDoi(admin as never, {
      prefix,
      suffixPattern: overrideSuffixPattern !== undefined ? overrideSuffixPattern : j.doi_suffix_pattern,
      journalSlug: j.slug,
      manuscriptNumber,
    });
    doi = gen.doi;
    doiPrefix = gen.prefix;
    doiSuffix = gen.suffix;
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to generate DOI" }, { status: 500 });
  }

  // Build Crossref metadata
  const { data: authors } = await admin.from("article_authors").select("first_name, last_name, orcid, affiliation").eq("article_id", articleId).order("author_order", { ascending: true });
  const authorList = ((authors ?? []) as Array<{ first_name: string; last_name: string; orcid: string | null; affiliation: string | null }>).map(a => ({
    firstName: a.first_name,
    lastName: a.last_name,
    orcid: a.orcid,
    affiliation: a.affiliation,
  }));
  if (authorList.length === 0) {
    const { data: mAuthors } = await admin.from("manuscript_authors").select("first_name, last_name, orcid, institution_name_snapshot").eq("manuscript_id", art.manuscript_id).order("author_order", { ascending: true });
    const mapped = ((mAuthors ?? []) as Array<{ first_name: string; last_name: string; orcid: string | null; institution_name_snapshot: string | null }>).map(a => ({
      firstName: a.first_name, lastName: a.last_name, orcid: a.orcid, affiliation: a.institution_name_snapshot,
    }));
    authorList.push(...mapped);
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const resourceUrl = publicUrl ?? `${appUrl}/articles/${art.slug}`;

  const metadata = buildCrossrefMetadata({
    journal: { name: j.name, shortName: j.short_name, issnPrint: j.issn_print, issnOnline: j.issn_online, publisherName: j.publisher_name },
    article: { title: art.title, abstract: art.abstract, doi, publicUrl: resourceUrl, licenseUrl: art.license_url, authors: authorList },
    depositor: { name: j.publisher_name ?? j.name, email: process.env.CROSSREF_DEPOSIT_EMAIL ?? "depositor@example.test" },
    registrant: j.publisher_name ?? j.name,
  });

  // Persist DOI record as pending/queued
  try {
    const record = await upsertDoiRecord(admin as never, { articleId, doi, prefix: doiPrefix, suffix: doiSuffix, status: "queued", metadata: metadata as unknown as Record<string, unknown> });
    const job = await queueDoiRegistration(admin as never, { articleId, doi, metadata });
    await admin.from("audit_logs").insert({ actor_id: user.id, journal_id: art.journal_id, manuscript_id: art.manuscript_id, action: "doi.queued", entity_type: "doi_record", entity_id: (record as { id: string }).id, new_data: { doi, resource: resourceUrl } } as never);
    return NextResponse.json({ data: record, job, doi, doiUrl: `https://doi.org/${doi}`, message: "DOI enqueued (job_type doi_registration). Worker will deposit to Crossref." }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to queue DOI" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const articleId = new URL(req.url).searchParams.get("articleId");
  if (!articleId) return NextResponse.json({ error: "articleId required" }, { status: 400 });
  const admin = createAdminClient();
  const { data, error } = await admin.from("doi_records").select("*").eq("article_id", articleId).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ data: null });
  return NextResponse.json({ data });
}
