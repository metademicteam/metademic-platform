import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

const querySchema = z.object({
  manuscriptId: z.string().uuid().optional(),
  assignmentId: z.string().uuid().optional(),
});

// GET /api/reviews — fetch reviews for current reviewer or for manuscript (editor view)
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const manuscriptId = url.searchParams.get("manuscriptId");
  const assignmentId = url.searchParams.get("assignmentId");

  // If assignmentId requested, check ownership
  if (assignmentId) {
    const { data: assignment } = await supabase.from("review_assignments").select("id, reviewer_id, review_round_id").eq("id", assignmentId).single();
    if (!assignment) return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
    const ass = assignment as { id: string; reviewer_id: string; review_round_id: string };
    const { data: profile } = await supabase.from("reviewer_profiles").select("user_id").eq("id", ass.reviewer_id).single();
    const isOwner = profile && (profile as { user_id: string }).user_id === user.id;
    // Also allow editor of the manuscript's journal
    let isEditor = false;
    if (!isOwner) {
      const { data: round } = await supabase.from("review_rounds").select("manuscript_id").eq("id", ass.review_round_id).single();
      if (round) {
        const { data: man } = await supabase.from("manuscripts").select("journal_id").eq("id", (round as { manuscript_id: string }).manuscript_id).single();
        if (man) {
          const { data: mem } = await supabase.from("journal_members").select("role").eq("user_id", user.id).eq("journal_id", (man as { journal_id: string }).journal_id).eq("is_active", true);
          isEditor = (mem ?? []).some((r) => ["editor", "managing_editor", "editor_in_chief", "section_editor", "journal_manager", "journal_admin", "super_admin"].includes((r as { role: string }).role));
        }
      }
    }
    if (!isOwner && !isEditor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const { data: report } = await supabase.from("review_reports").select("*").eq("review_assignment_id", assignmentId).maybeSingle();
    const { data: annotations } = await supabase.from("review_annotations").select("*").eq("review_assignment_id", assignmentId);
    return NextResponse.json({ data: { report: report ?? null, annotations: annotations ?? [] } });
  }

  // Fallback: list reports for reviewer
  const { data: profile } = await supabase.from("reviewer_profiles").select("id").eq("user_id", user.id).maybeSingle();
  if (!profile) {
    // If not reviewer, try editor view for manuscript
    if (manuscriptId) {
      const { data: rounds } = await supabase.from("review_rounds").select("id").eq("manuscript_id", manuscriptId);
      const roundIds = (rounds ?? []).map((r) => (r as { id: string }).id);
      if (roundIds.length === 0) return NextResponse.json({ data: [] });
      const { data: assignments } = await supabase.from("review_assignments").select("id").in("review_round_id", roundIds);
      const assignIds = (assignments ?? []).map((a) => (a as { id: string }).id);
      if (assignIds.length === 0) return NextResponse.json({ data: [] });
      const { data: reports } = await supabase.from("review_reports").select("*").in("review_assignment_id", assignIds);
      return NextResponse.json({ data: reports ?? [] });
    }
    return NextResponse.json({ error: "Reviewer profile not found" }, { status: 404 });
  }
  const reviewerId = (profile as { id: string }).id;
  const { data: assignments } = await supabase.from("review_assignments").select("id").eq("reviewer_id", reviewerId);
  const ids = (assignments ?? []).map((a) => (a as { id: string }).id);
  if (ids.length === 0) return NextResponse.json({ data: [] });
  const { data: reports } = await supabase.from("review_reports").select("*").in("review_assignment_id", ids).order("created_at", { ascending: false });
  return NextResponse.json({ data: reports ?? [] });
}

// POST /api/reviews — create or update review report (alternative to /review-assignments/[id]/submit)
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
  const obj = body as Record<string, unknown>;
  const assignmentId = obj.reviewAssignmentId as string | undefined;
  if (!assignmentId) return NextResponse.json({ error: "reviewAssignmentId is required" }, { status: 400 });

  // Delegate to review-assignments submit logic — validate ownership
  const { data: assignment } = await supabase.from("review_assignments").select("id, reviewer_id, status").eq("id", assignmentId).single();
  if (!assignment) return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
  const ass = assignment as { id: string; reviewer_id: string; status: string };
  const { data: profile } = await supabase.from("reviewer_profiles").select("user_id").eq("id", ass.reviewer_id).single();
  if (!profile || (profile as { user_id: string }).user_id !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (ass.status === "completed") return NextResponse.json({ error: "Review already submitted" }, { status: 409 });

  const schema = z.object({
    originality_score: z.number().int().min(1).max(5).nullable().optional(),
    methodology_score: z.number().int().min(1).max(5).nullable().optional(),
    literature_score: z.number().int().min(1).max(5).nullable().optional(),
    results_score: z.number().int().min(1).max(5).nullable().optional(),
    discussion_score: z.number().int().min(1).max(5).nullable().optional(),
    writing_score: z.number().int().min(1).max(5).nullable().optional(),
    significance_score: z.number().int().min(1).max(5).nullable().optional(),
    comments_to_author: z.string().max(10000).nullable().optional(),
    confidential_comments_to_editor: z.string().max(10000).nullable().optional(),
    recommendation: z.enum(["accept", "minor_revision", "major_revision", "reject", "no_recommendation"]),
    annotations: z
      .array(z.object({ selected_text: z.string().max(2000), comment: z.string().max(2000), visibility: z.string().optional() }))
      .optional(),
  });

  const parsed = schema.safeParse(obj);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0]?.message ?? "Validation failed" }, { status: 400 });

  // Upsert report
  const { data: existing } = await supabase.from("review_reports").select("id").eq("review_assignment_id", assignmentId).maybeSingle();
  const payload: Record<string, unknown> = {
    review_assignment_id: assignmentId,
    originality_score: parsed.data.originality_score ?? null,
    methodology_score: parsed.data.methodology_score ?? null,
    literature_score: parsed.data.literature_score ?? null,
    results_score: parsed.data.results_score ?? null,
    discussion_score: parsed.data.discussion_score ?? null,
    writing_score: parsed.data.writing_score ?? null,
    significance_score: parsed.data.significance_score ?? null,
    comments_to_author: parsed.data.comments_to_author ?? null,
    confidential_comments_to_editor: parsed.data.confidential_comments_to_editor ?? null,
    recommendation: parsed.data.recommendation,
    submitted_at: new Date().toISOString(),
  };

  if (existing) {
    const { error } = await supabase.from("review_reports").update(payload as never).eq("id", (existing as { id: string }).id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    const { error } = await supabase.from("review_reports").insert(payload as never);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await supabase.from("review_assignments").update({ status: "completed", completed_at: new Date().toISOString() } as never).eq("id", assignmentId);

  // Annotations
  if (parsed.data.annotations?.length) {
    // Need version_id — fetch latest manuscript version
    const { data: round } = await supabase.from("review_assignments").select("review_round_id").eq("id", assignmentId).single();
    if (round) {
      const { data: reviewRound } = await supabase.from("review_rounds").select("manuscript_id").eq("id", (round as { review_round_id: string }).review_round_id).single();
      if (reviewRound) {
        const { data: version } = await supabase.from("manuscript_versions").select("id").eq("manuscript_id", (reviewRound as { manuscript_id: string }).manuscript_id).order("version_number", { ascending: false }).limit(1).maybeSingle();
        const versionId = version ? (version as { id: string }).id : null;
        if (versionId) {
          for (const ann of parsed.data.annotations) {
            await supabase.from("review_annotations").insert({
              review_assignment_id: assignmentId,
              version_id: versionId,
              selected_text: ann.selected_text,
              comment: ann.comment,
              visibility: (ann.visibility as never) ?? "author_reviewer_editor",
            } as never);
          }
        }
      }
    }
  }

  return NextResponse.json({ data: { assignmentId, status: "completed" } });
}
