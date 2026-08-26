import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createManuscriptSchema, manuscriptWizardSchema } from "@/lib/validations/manuscript";
import { createManuscript as createManuscriptService } from "@/lib/services/manuscript-service";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
  const pageSize = Math.min(100, Math.max(1, parseInt(url.searchParams.get("pageSize") || "10", 10)));
  const search = url.searchParams.get("search") || undefined;
  const status = url.searchParams.get("status") || undefined;
  const journalId = url.searchParams.get("journalId") || undefined;
  const sortBy = (url.searchParams.get("sortBy") as "created_at" | "updated_at" | "submitted_at") || "updated_at";
  const sortDir = (url.searchParams.get("sortDir") as "asc" | "desc") || "desc";

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  // Author sees only own submissions; editors/admins would see more but for author API we scope to submitted_by
  let query = supabase
    .from("manuscripts")
    .select("*, journals!inner(id, name, slug)", { count: "exact" })
    .eq("submitted_by", user.id)
    .order(sortBy, { ascending: sortDir === "asc" })
    .range(from, to);

  if (journalId) query = query.eq("journal_id", journalId);
  if (status && status !== "all") query = query.eq("status", status as never);
  if (search) {
    const term = `%${search}%`;
    query = query.or(`title.ilike.${term},manuscript_number.ilike.${term},abstract.ilike.${term}`);
  }

  const { data, error, count } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: data ?? [], count: count ?? 0, page, pageSize });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Accept both simple create and wizard payload (we extract core fields)
  const obj = body as Record<string, unknown>;

  // Try simple schema first
  const parsedSimple = createManuscriptSchema.safeParse(body);
  if (parsedSimple.success) {
    try {
      const row = await createManuscriptService(supabase as unknown as never, user.id, parsedSimple.data);
      // Also create initial version row
      const manuscriptId = (row as { id: string }).id;
      const versionInsert = {
        manuscript_id: manuscriptId,
        version_number: 1,
        revision_round: 0,
        version_label: "Initial submission",
        submitted_by: user.id,
      } as never;
      const { error: versionErr } = await supabase.from("manuscript_versions").insert(versionInsert);
      if (versionErr) {
        // Fall back to service-role (bypasses RLS) so the draft is complete.
        const { createAdminClient } = await import("@/lib/supabase/admin");
        const admin = createAdminClient();
        const { error: adminVersionErr } = await admin.from("manuscript_versions").insert(versionInsert);
        if (adminVersionErr) {
          console.error("[manuscripts] version insert failed (anon + admin):", versionErr.message, adminVersionErr.message);
        }
      }

      // Persist wizard metadata if present (authors, affiliations, declarations, suggestions)
      // This is stored in manuscripts.metadata and related tables best-effort
      const meta = obj.metadata as Record<string, unknown> | undefined;
      if (meta?.wizard) {
        const wizard = meta.wizard as Record<string, unknown>;
        // Declarations
        const decl = wizard.declarations as Record<string, unknown> | undefined;
        if (decl) {
          await supabase.from("submission_declarations").upsert(
            {
              manuscript_id: manuscriptId,
              conflict_of_interest: (decl.conflictOfInterest as string) || null,
              funding_statement: (decl.fundingStatement as string) || null,
              ethics_statement: (decl.ethicsStatement as string) || null,
              data_availability_statement: (decl.dataAvailabilityStatement as string) || null,
              author_contributions: (decl.authorContributions as string) || null,
              acknowledgements: (decl.acknowledgements as string) || null,
              originality_confirmed: !!decl.originalityConfirmed,
              ethics_confirmed: !!decl.ethicsConfirmed,
              authorship_confirmed: !!decl.authorshipConfirmed,
              copyright_confirmed: !!decl.copyrightConfirmed,
            } as never,
            { onConflict: "manuscript_id" }
          );
        }
        // Authors
        const authors = wizard.authors as Array<Record<string, unknown>> | undefined;
        if (authors?.length) {
          // Clear existing then insert
          await supabase.from("manuscript_authors").delete().eq("manuscript_id", manuscriptId);
          for (let i = 0; i < authors.length; i++) {
            const a = authors[i];
            await supabase.from("manuscript_authors").insert({
              manuscript_id: manuscriptId,
              first_name: (a.firstName as string) || "Unknown",
              middle_name: (a.middleName as string) || null,
              last_name: (a.lastName as string) || "Unknown",
              email: (a.email as string) || null,
              orcid: (a.orcid as string) || null,
              institution_name_snapshot: (a.institutionName as string) || null,
              department_snapshot: (a.department as string) || null,
              author_order: (a.authorOrder as number) || i + 1,
              is_corresponding: !!a.isCorresponding,
              contribution_statement: (a.contributionStatement as string) || null,
            } as never);
          }
        }
        // Suggested / excluded
        const suggested = wizard.suggestedReviewers as Array<Record<string, unknown>> | undefined;
        if (suggested?.length) {
          for (const s of suggested) {
            await supabase.from("manuscript_reviewer_suggestions").insert({
              manuscript_id: manuscriptId,
              reviewer_name: (s.reviewerName as string) || "",
              reviewer_email: (s.reviewerEmail as string) || null,
              institution: (s.institution as string) || null,
              expertise: (s.expertise as string[]) || [],
              reason: (s.reason as string) || null,
            } as never);
          }
        }
        const excluded = wizard.excludedReviewers as Array<Record<string, unknown>> | undefined;
        if (excluded?.length) {
          for (const e of excluded) {
            await supabase.from("manuscript_excluded_reviewers").insert({
              manuscript_id: manuscriptId,
              reviewer_name: (e.reviewerName as string) || null,
              reviewer_email: (e.reviewerEmail as string) || null,
              reason: (e.reason as string) || null,
            } as never);
          }
        }
      } else {
        // Also support flat authors/etc at top level
        const authors = obj.authors as Array<Record<string, unknown>> | undefined;
        if (authors?.length) {
          for (let i = 0; i < authors.length; i++) {
            const a = authors[i];
            await supabase.from("manuscript_authors").insert({
              manuscript_id: manuscriptId,
              first_name: (a.firstName as string) || "Unknown",
              middle_name: (a.middleName as string) || null,
              last_name: (a.lastName as string) || "Unknown",
              email: (a.email as string) || null,
              orcid: (a.orcid as string) || null,
              institution_name_snapshot: (a.institutionName as string) || null,
              department_snapshot: (a.department as string) || null,
              author_order: (a.authorOrder as number) || i + 1,
              is_corresponding: !!a.isCorresponding,
              contribution_statement: (a.contributionStatement as string) || null,
            } as never);
          }
        }
      }

      // Update manuscript metadata to keep wizard snapshot
      if (obj.metadata) {
        await supabase.from("manuscripts").update({ metadata: obj.metadata } as never).eq("id", manuscriptId);
      }

      return NextResponse.json({ data: row }, { status: 201 });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to create manuscript";
      const code = (e as { code?: string }).code;
      if (code === "VALIDATION_ERROR") return NextResponse.json({ error: msg }, { status: 400 });
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  // Fallback: try wizard schema (may have journalId at top-level even if createManuscriptSchema succeeded but wizard fields missing)
  const wizardParsed = manuscriptWizardSchema.safeParse(body);
  if (!wizardParsed.success) {
    return NextResponse.json({ error: wizardParsed.error.errors[0]?.message ?? "Validation failed", details: wizardParsed.error.flatten() }, { status: 400 });
  }

  // Use wizard data to create manuscript
  const w = wizardParsed.data as unknown as Record<string, unknown>;
  try {
    const row = await createManuscriptService(supabase as unknown as never, user.id, {
      journalId: w.journalId,
      title: w.title,
      subtitle: w.subtitle ?? null,
      abstract: w.abstract ?? null,
      articleType: w.articleType ?? "research_article",
      keywords: w.keywords ?? [],
      subjectAreas: w.subjectAreas ?? [],
      languageCode: w.languageCode ?? "en",
    } as unknown as never);
    const manuscriptId = (row as { id: string }).id;
    await supabase.from("manuscript_versions").insert({
      manuscript_id: manuscriptId,
      version_number: 1,
      revision_round: 0,
      version_label: "Initial submission",
      submitted_by: user.id,
    } as never);
    return NextResponse.json({ data: row }, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to create manuscript";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
