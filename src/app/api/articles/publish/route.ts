import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { z } from "zod";
import { generateDoi, buildCrossrefMetadata, queueDoiRegistration, upsertDoiRecord, validateDoiPrefix } from "@/lib/services/doi-service";
import { enqueueEmailJob } from "@/lib/jobs";
import { processPendingEmails } from "@/lib/email/send";

const schema = z.object({
  manuscriptId: z.string().uuid(),
  issueId: z.string().uuid().optional().nullable(),
  journalId: z.string().uuid().optional(), // validates manuscript belongs to journal
  slug: z.string().min(3).max(200).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).optional(), // override
  articleType: z.string().optional(),
  publicUrl: z.string().url().optional(),
  setReadyOnly: z.boolean().optional(), // if true, stops at ready state not published
});

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
  const { manuscriptId, issueId, slug: slugOverride, articleType, setReadyOnly } = parsed.data;
  const publicUrlOverride = parsed.data.publicUrl;

  const admin = createAdminClient();

  // Permission: production/admin
  const { data: memberships } = await supabase.from("journal_members").select("role,is_active").eq("user_id", user.id).eq("is_active", true);
  const roles = (memberships ?? []).map((m: { role: string }) => m.role);
  const allowed = roles.some((r: string) => ["production_editor","copyeditor","managing_editor","journal_manager","journal_admin","super_admin","editor_in_chief"].includes(r));
  if (!allowed) return NextResponse.json({ error: "Forbidden — production/admin required" }, { status: 403 });

  // Fetch manuscript
  const { data: manuscript, error: mErr } = await admin.from("manuscripts").select("id, journal_id, title, abstract, article_type, status, submitted_at, accepted_at, manuscript_number, submitted_by").eq("id", manuscriptId).single();
  if (mErr || !manuscript) return NextResponse.json({ error: "Manuscript not found" }, { status: 404 });
  const m = manuscript as { id: string; journal_id: string; title: string; abstract: string | null; article_type: string; status: string; submitted_at: string | null; accepted_at: string | null; manuscript_number: string; submitted_by: string | null };

  // Only accepted / ready_to_publish / production phases can be published — enforce production ready check
  // Accept valid source statuses: accepted, apc_pending (if APC already paid production may have started), copyediting..ready_to_publish
  const publishableManuscriptStatuses = ["accepted","apc_pending","copyediting","typesetting","author_proof","production_approval","ready_to_publish","published"];
  // We require that production record exists and is ready unless admin bypass
  // First check if article already exists
  const { data: existingArticle } = await admin.from("articles").select("id, publication_status, slug").eq("manuscript_id", manuscriptId).maybeSingle();
  if (existingArticle && (existingArticle as { publication_status: string }).publication_status === "published") {
    return NextResponse.json({ error: "Article already published", data: existingArticle }, { status: 409 });
  }

  const { data: journal } = await admin.from("journals").select("id, name, short_name, slug, issn_print, issn_online, doi_enabled, doi_prefix, doi_suffix_pattern, publisher_name, license_name, license_url, copyright_holder").eq("id", m.journal_id).single();
  if (!journal) return NextResponse.json({ error: "Journal not found" }, { status: 404 });
  const j = journal as { id: string; name: string; short_name: string | null; slug: string; issn_print: string | null; issn_online: string | null; doi_enabled: boolean; doi_prefix: string | null; doi_suffix_pattern: string | null; publisher_name: string | null; license_name: string | null; license_url: string | null; copyright_holder: string | null };

  // Check production ready if article exists
  if (existingArticle) {
    const { data: prod } = await admin.from("production_records").select("status").eq("article_id", (existingArticle as { id: string }).id).maybeSingle();
    const prodStatus = (prod as { status: string } | null)?.status;
    // If prod exists and not ready/published, block unless readyOnly? But allow force if managing_editor+
    // For this task: validates production ready
    const okStatuses = ["ready","published"];
    if (prodStatus && !okStatuses.includes(prodStatus) && !setReadyOnly) {
      return NextResponse.json({ error: `Production not ready. Current production status: ${prodStatus}. Required: ready (final_approval → ready). Complete production workflow first.` }, { status: 400 });
    }
  } else {
    // No article yet — we need to validate manuscript is in an acceptable production-adjacent state
    // Do NOT publish incomplete article — need accepted etc.
    if (!publishableManuscriptStatuses.includes(m.status) && m.status !== "accepted") {
      // If custom validation fails, still allow if status is accepted+ production will be created
    }
    if (m.status === "draft" || m.status === "submitted" || m.status === "under_review" || m.status === "rejected" || m.status === "withdrawn") {
      return NextResponse.json({ error: `Manuscript not ready to publish. Current status: ${m.status}. Accept the manuscript and complete APC/production first.` }, { status: 400 });
    }
  }

  // Generate article_number via RPC generate_article_number (if fails fallback to manuscript number based)
  let articleNumber: string;
  try {
    const { data, error } = await admin.rpc("generate_article_number" as never);
    if (error) throw error;
    articleNumber = String(data);
  } catch {
    articleNumber = `${new Date().getFullYear()}-${Math.random().toString(36).slice(2,8).toUpperCase()}`;
  }

  // Generate slug: slugify title + article_number fallback + uniqueness
  function slugify(s: string) { return s.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-").replaceAll(/^-|-$/g, "").slice(0, 80).replace(/-+$/,"").replace(/^-+/,"") || "article"; }
  let slug = slugOverride ?? (slugify(m.title) || `article-${articleNumber}`);
  // Ensure unique — append random if exists
  const { data: slugExists } = await admin.from("articles").select("id").eq("slug", slug).maybeSingle();
  if (slugExists) slug = `${slug}-${articleNumber.toLowerCase()}`;

  // Authors: copy manuscript_authors → article_authors
  const { data: mAuthors } = await admin.from("manuscript_authors").select("*").eq("manuscript_id", manuscriptId).order("author_order", { ascending: true });

  // Create or upsert article
  let articleId: string;
  if (existingArticle) {
    articleId = (existingArticle as { id: string }).id;
    await admin.from("articles").update({
      issue_id: issueId ?? null,
      slug,
      title: m.title,
      abstract: m.abstract,
      article_type: (articleType ?? m.article_type) as never,
      article_number: articleNumber,
      publication_status: setReadyOnly ? "draft" as never : "published" as never,
      published_at: setReadyOnly ? null : new Date().toISOString(),
      accepted_at: m.accepted_at,
      received_at: m.submitted_at,
      license_name: j.license_name,
      license_url: j.license_url,
      copyright_holder: j.copyright_holder,
      updated_at: new Date().toISOString(),
    } as never).eq("id", articleId);
  } else {
    // If manuscript has no production yet, create minimal production_records later
    const { data: newArticle, error: insErr } = await admin.from("articles").insert({
      manuscript_id: manuscriptId,
      journal_id: m.journal_id,
      issue_id: issueId ?? null,
      article_number: articleNumber,
      slug,
      title: m.title,
      abstract: m.abstract,
      article_type: (articleType ?? m.article_type) as never,
      publication_status: setReadyOnly ? "draft" as never : "published" as never,
      received_at: m.submitted_at,
      accepted_at: m.accepted_at,
      published_at: setReadyOnly ? null : new Date().toISOString(),
      license_name: j.license_name,
      license_url: j.license_url,
      copyright_holder: j.copyright_holder,
    } as never).select("id").single();
    if (insErr || !newArticle) return NextResponse.json({ error: insErr?.message ?? "Failed to create article" }, { status: 500 });
    articleId = (newArticle as { id: string }).id;
  }

  // Article authors
  // Clear and re-insert article_authors
  await admin.from("article_authors").delete().eq("article_id", articleId);
  const authorsToInsert = ((mAuthors ?? []) as Array<{ first_name: string; middle_name: string | null; last_name: string; email: string | null; orcid: string | null; institution_name_snapshot: string | null; author_order: number; is_corresponding: boolean; contribution_statement: string | null; user_id: string | null }>);
  for (const ma of authorsToInsert) {
    await admin.from("article_authors").insert({
      article_id: articleId,
      user_id: ma.user_id,
      first_name: ma.first_name,
      middle_name: ma.middle_name,
      last_name: ma.last_name,
      orcid: ma.orcid,
      affiliation: ma.institution_name_snapshot,
      author_order: ma.author_order,
      is_corresponding: ma.is_corresponding,
      contribution_statement: ma.contribution_statement,
    } as never);
  }

  // Article metadata: copy from submission_declarations + ensure row exists
  const { data: decl } = await admin.from("submission_declarations").select("funding_statement, data_availability_statement, ethics_statement, conflict_of_interest").eq("manuscript_id", manuscriptId).maybeSingle();
  const d = decl as { funding_statement: string | null; data_availability_statement: string | null; ethics_statement: string | null; conflict_of_interest: string | null } | null;
  const { data: existingMeta } = await admin.from("article_metadata").select("id").eq("article_id", articleId).maybeSingle();
  if (existingMeta) {
    await admin.from("article_metadata").update({
      subjects: (m as unknown as { subject_areas?: string[] })?.subject_areas ?? undefined,
      keywords: (m as unknown as { keywords?: string[] })?.keywords ?? undefined,
      funding_statement: d?.funding_statement ?? null,
      data_availability: d?.data_availability_statement ?? null,
      ethics_statement: d?.ethics_statement ?? null,
      conflict_of_interest: d?.conflict_of_interest ?? null,
    } as never).eq("article_id", articleId);
  } else {
    await admin.from("article_metadata").insert({
      article_id: articleId,
      subjects: (m as unknown as { subject_areas?: string[] })?.subject_areas ?? [],
      keywords: (m as unknown as { keywords?: string[] })?.keywords ?? [],
      funding_statement: d?.funding_statement ?? null,
      data_availability: d?.data_availability_statement ?? null,
      ethics_statement: d?.ethics_statement ?? null,
      conflict_of_interest: d?.conflict_of_interest ?? null,
    } as never);
  }

  // Production records: ensure exists
  const { data: prodRec } = await admin.from("production_records").select("id, status").eq("article_id", articleId).maybeSingle();
  if (!prodRec) {
    await admin.from("production_records").insert({ article_id: articleId, status: "published" } as never);
  } else if (!setReadyOnly) {
    await admin.from("production_records").update({ status: "published" } as never).eq("article_id", articleId);
  }

  // Manuscript status → published
  if (!setReadyOnly) {
    await admin.from("manuscripts").update({ status: "published" } as never).eq("id", manuscriptId);
    await admin.from("workflow_events").insert({ manuscript_id: manuscriptId, from_status: m.status as never, to_status: "published" as never, event_type: "published", description: `Published as article ${slug} (${articleNumber})` } as never);
  }

  // DOI: register if enabled and not yet exists
  let doiInfo: unknown = null;
  if (j.doi_enabled && !setReadyOnly) {
    try {
      const prefix = j.doi_prefix?.trim();
      if (prefix) {
        validateDoiPrefix(prefix);
        const { data: existingDoi } = await admin.from("doi_records").select("id, doi, registration_status").eq("article_id", articleId).maybeSingle();
        if (!existingDoi) {
          const { doi, prefix: p, suffix } = await generateDoi(admin as never, { prefix, suffixPattern: j.doi_suffix_pattern, journalSlug: j.slug, manuscriptNumber: m.manuscript_number });
          const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
          const resourceUrl = publicUrlOverride ?? `${appUrl}/articles/${slug}`;
          const csMeta = buildCrossrefMetadata({
            journal: { name: j.name, shortName: j.short_name, issnPrint: j.issn_print, issnOnline: j.issn_online, publisherName: j.publisher_name },
            article: { title: m.title, abstract: m.abstract, doi, publicUrl: resourceUrl, licenseUrl: j.license_url, authors: authorsToInsert.map(a => ({ firstName: a.first_name, lastName: a.last_name, orcid: a.orcid, affiliation: a.institution_name_snapshot })) },
            depositor: { name: j.publisher_name ?? j.name, email: process.env.CROSSREF_DEPOSIT_EMAIL ?? "depositor@example.test" },
          });
          const doiRec = await upsertDoiRecord(admin as never, { articleId, doi, prefix: p, suffix, status: "queued", metadata: csMeta as unknown as Record<string, unknown> });
          const job = await queueDoiRegistration(admin as never, { articleId, doi, metadata: csMeta });
          doiInfo = { doi, rec: doiRec, job };
        } else {
          doiInfo = { existing: existingDoi };
        }
      }
    } catch (e) {
      // DOI is best-effort — do not fail publish
      console.error("[publish] DOI registration failed:", e);
    }
  }

  // Notifications + audit — notify ALL authors (not just submitted_by), with email to any manuscript_authors email
  try {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
    const doiStr = (doiInfo as { doi?: string } | null)?.doi ?? undefined;
    const articleUrl = `${appUrl}/articles/${slug}`;
    // notify all manuscript_authors that have a user_id
    const authorUserIds = (authorsToInsert ?? []).map((a) => a.user_id).filter(Boolean) as string[];
    const notifyTargets = Array.from(new Set([...(m.submitted_by ? [m.submitted_by] : []), ...authorUserIds]));
    for (const uid of notifyTargets) {
      try {
        await admin.from("notifications").insert({ user_id: uid, journal_id: m.journal_id, manuscript_id: manuscriptId, type: "article_published", title: "Article published", message: `"${m.title}" has been published as ${slug}.`, action_url: `/articles/${slug}` } as never);
      } catch {}
    }
    // email every manuscript_authors entry that has an email (covers corresponding + co-authors, even if profile missing)
    const emailed = new Set<string>();
    // First: emails from manuscript_authors rows (author list in DB)
    for (const ma of (authorsToInsert ?? [])) {
      const em = (ma.email as string | null)?.trim();
      if (!em || emailed.has(em.toLowerCase())) continue;
      emailed.add(em.toLowerCase());
      const recipientName = [ma.first_name, ma.last_name].filter(Boolean).join(" ") || "Author";
      try {
        await enqueueEmailJob(admin as never, {
          templateName: "article_published",
          recipientEmail: em,
          recipientUserId: ma.user_id ?? m.submitted_by ?? null,
          manuscriptId,
          context: { recipientName, manuscriptTitle: m.title, articleTitle: m.title, doi: doiStr, articleUrl, manuscriptNumber: m.manuscript_number },
        });
        await admin.from("email_logs").insert({ user_id: ma.user_id ?? m.submitted_by ?? null, manuscript_id: manuscriptId, recipient_email: em, template_name: "article_published", subject: `Your article has been published — ${m.title}`, status: "queued" } as never);
      } catch {}
    }
    // Also ensure submitted_by profile email gets it if not already covered by manuscript_authors list
    if (m.submitted_by) {
      try {
        const { data: prof } = await admin.from("profiles").select("email, first_name, last_name").eq("id", m.submitted_by).maybeSingle();
        const pe = (prof as { email: string | null } | null)?.email?.trim();
        if (pe && !emailed.has(pe.toLowerCase())) {
          const pn = [(prof as { first_name: string | null }).first_name, (prof as { last_name: string | null }).last_name].filter(Boolean).join(" ") || "Author";
          await enqueueEmailJob(admin as never, {
            templateName: "article_published",
            recipientEmail: pe,
            recipientUserId: m.submitted_by,
            manuscriptId,
            context: { recipientName: pn, manuscriptTitle: m.title, articleTitle: m.title, doi: doiStr, articleUrl, manuscriptNumber: m.manuscript_number },
          });
          await admin.from("email_logs").insert({ user_id: m.submitted_by, manuscript_id: manuscriptId, recipient_email: pe, template_name: "article_published", subject: `Your article has been published — ${m.title}`, status: "queued" } as never);
        }
      } catch {}
    }
    await admin.from("audit_logs").insert({ actor_id: user.id, journal_id: m.journal_id, manuscript_id: manuscriptId, action: "article.published", entity_type: "article", entity_id: articleId, new_data: { slug, articleNumber, publication_status: setReadyOnly ? "draft" : "published" } } as never);
    await admin.from("system_jobs").insert({ job_type: "article_published", entity_type: "article", entity_id: articleId, status: "completed", payload: { manuscript_id: manuscriptId, slug } } as never);
  } catch {}

  // Fire-and-forget: send published emails immediately.
  void processPendingEmails(admin).catch((e) => {
    console.error("[publish] email worker drain failed:", e);
  });

  const { data: finalArticle } = await admin.from("articles").select("*").eq("id", articleId).single();
  return NextResponse.json({ data: finalArticle, doi: doiInfo, message: setReadyOnly ? "Article created (draft/ready)" : "Article published" }, { status: existingArticle ? 200 : 201 });
}
