import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createManuscriptSchema } from "@/lib/validations/manuscript";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: manuscript, error } = await supabase.from("manuscripts").select("*, journals(id, name, slug)").eq("id", id).single();
  if (error || !manuscript) return NextResponse.json({ error: "Manuscript not found" }, { status: 404 });

  const m = manuscript as { submitted_by: string | null };
  if (m.submitted_by !== user.id) {
    // Allow editors? For author route we restrict to owner; check membership is editor if not owner
    const { data: memberships } = await supabase.from("journal_members").select("role").eq("user_id", user.id).eq("journal_id", (manuscript as { journal_id: string }).journal_id).eq("is_active", true);
    const isEditor = (memberships ?? []).some((r: { role: string }) => ["editor", "editor_in_chief", "managing_editor", "journal_admin", "super_admin"].includes(r.role));
    if (!isEditor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Fetch related data
  const [{ data: authors }, { data: versions }, { data: files }, { data: declarations }, { data: suggested }, { data: excluded }, { data: workflow }] = await Promise.all([
    supabase.from("manuscript_authors").select("*").eq("manuscript_id", id).order("author_order"),
    supabase.from("manuscript_versions").select("*").eq("manuscript_id", id).order("version_number"),
    supabase.from("manuscript_files").select("*").eq("manuscript_id", id).order("created_at"),
    supabase.from("submission_declarations").select("*").eq("manuscript_id", id).maybeSingle(),
    supabase.from("manuscript_reviewer_suggestions").select("*").eq("manuscript_id", id),
    supabase.from("manuscript_excluded_reviewers").select("*").eq("manuscript_id", id),
    supabase.from("workflow_events").select("*").eq("manuscript_id", id).order("created_at", { ascending: false }).limit(20),
  ]);

  return NextResponse.json({
    data: {
      manuscript,
      authors: authors ?? [],
      versions: versions ?? [],
      files: files ?? [],
      declarations: declarations ?? null,
      suggestedReviewers: suggested ?? [],
      excludedReviewers: excluded ?? [],
      timeline: workflow ?? [],
    },
  });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Handle status transition separately (withdraw)
  if (body.status === "withdrawn") {
    const { data: ms } = await supabase.from("manuscripts").select("status, submitted_by").eq("id", id).single();
    const s = (ms as { status: string; submitted_by: string | null } | null)?.status;
    if (!ms) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if ((ms as { submitted_by: string | null }).submitted_by !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    // Allow draft or submitted -> withdrawn; use workflow validation
    const { validateTransition } = await import("@/lib/workflow");
    try {
      validateTransition(s as never, "withdrawn");
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "Invalid transition" }, { status: 400 });
    }
    const { data, error } = await supabase
      .from("manuscripts")
      .update({ status: "withdrawn", withdrawn_at: new Date().toISOString() } as never)
      .eq("id", id)
      .select("*")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    // log workflow
    await supabase.from("workflow_events").insert({
      manuscript_id: id,
      actor_id: user.id,
      from_status: s as never,
      to_status: "withdrawn" as never,
      event_type: "manuscript.withdrawn",
      description: "Author withdrew manuscript",
    } as never);
    return NextResponse.json({ data });
  }

  // Regular draft update — only allowed if status is draft or returned_to_author
  const { data: existing } = await supabase.from("manuscripts").select("status, submitted_by").eq("id", id).single();
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if ((existing as { submitted_by: string | null }).submitted_by !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const allowedDraftStatuses = ["draft", "returned_to_author"];
  if (!allowedDraftStatuses.includes((existing as { status: string }).status)) {
    return NextResponse.json({ error: "Only draft manuscripts can be edited" }, { status: 400 });
  }

  // Validate partial fields
  const patch: Record<string, unknown> = {};
  if (body.title !== undefined) patch.title = body.title;
  if (body.subtitle !== undefined) patch.subtitle = body.subtitle;
  if (body.abstract !== undefined) patch.abstract = body.abstract;
  if (body.articleType !== undefined) patch.article_type = body.articleType;
  if (body.keywords !== undefined) patch.keywords = body.keywords;
  if (body.subjectAreas !== undefined) patch.subject_areas = body.subjectAreas;
  if (body.languageCode !== undefined) patch.language_code = body.languageCode;
  if (body.journalId !== undefined) patch.journal_id = body.journalId;
  if (body.metadata !== undefined) patch.metadata = body.metadata as never;

  // Basic validation for title/abstract length
  if (patch.title && typeof patch.title === "string" && (patch.title as string).trim().length < 10) {
    return NextResponse.json({ error: "Title must be at least 10 characters" }, { status: 400 });
  }

  const { data: updated, error: upErr } = await supabase.from("manuscripts").update(patch as never).eq("id", id).select("*").single();
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  // Also upsert related tables if provided in body.metadata.wizard
  const meta = body.metadata as Record<string, unknown> | undefined;
  const wizard = (meta?.wizard as Record<string, unknown> | undefined) ?? (body.wizard as Record<string, unknown> | undefined);
  if (wizard) {
    const decl = wizard.declarations as Record<string, unknown> | undefined;
    if (decl) {
      await supabase.from("submission_declarations").upsert(
        {
          manuscript_id: id,
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
    const authors = wizard.authors as Array<Record<string, unknown>> | undefined;
    if (authors !== undefined) {
      await supabase.from("manuscript_authors").delete().eq("manuscript_id", id);
      for (let i = 0; i < authors.length; i++) {
        const a = authors[i];
        await supabase.from("manuscript_authors").insert({
          manuscript_id: id,
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

  return NextResponse.json({ data: updated });
}
