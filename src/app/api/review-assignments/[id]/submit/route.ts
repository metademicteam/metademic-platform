import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";
import { getRecommendationForRound, reviewRoundCompleted } from "@/lib/services/review-service";

const schema = z.object({
  originality_score: z.number().int().min(1).max(5).nullable().optional(),
  methodology_score: z.number().int().min(1).max(5).nullable().optional(),
  literature_score: z.number().int().min(1).max(5).nullable().optional(),
  results_score: z.number().int().min(1).max(5).nullable().optional(),
  discussion_score: z.number().int().min(1).max(5).nullable().optional(),
  writing_score: z.number().int().min(1).max(5).nullable().optional(),
  significance_score: z.number().int().min(1).max(5).nullable().optional(),
  comments_to_author: z.string().max(10000).nullable().optional().or(z.literal("")),
  confidential_comments_to_editor: z.string().max(10000).nullable().optional().or(z.literal("")),
  recommendation: z.enum(["accept", "minor_revision", "major_revision", "reject", "no_recommendation"]),
  // support alternative camelCase from ReviewForm
  originalityScore: z.number().int().min(1).max(5).nullable().optional(),
  methodologyScore: z.number().int().min(1).max(5).nullable().optional(),
  literatureScore: z.number().int().min(1).max(5).nullable().optional(),
  resultsScore: z.number().int().min(1).max(5).nullable().optional(),
  discussionScore: z.number().int().min(1).max(5).nullable().optional(),
  writingScore: z.number().int().min(1).max(5).nullable().optional(),
  significanceScore: z.number().int().min(1).max(5).nullable().optional(),
  commentsToAuthor: z.string().max(10000).nullable().optional().or(z.literal("")),
  confidentialCommentsToEditor: z.string().max(10000).nullable().optional().or(z.literal("")),
  annotations: z
    .array(
      z.object({
        selected_text: z.string().max(5000).optional(),
        selectedText: z.string().max(5000).optional(),
        comment: z.string().max(5000),
        visibility: z.string().optional(),
      })
    )
    .optional(),
  annotated_file_name: z.string().optional(),
});

function normalize(body: z.infer<typeof schema>) {
  return {
    originality_score: body.originality_score ?? body.originalityScore ?? null,
    methodology_score: body.methodology_score ?? body.methodologyScore ?? null,
    literature_score: body.literature_score ?? body.literatureScore ?? null,
    results_score: body.results_score ?? body.resultsScore ?? null,
    discussion_score: body.discussion_score ?? body.discussionScore ?? null,
    writing_score: body.writing_score ?? body.writingScore ?? null,
    significance_score: body.significance_score ?? body.significanceScore ?? null,
    comments_to_author: body.comments_to_author ?? body.commentsToAuthor ?? null,
    confidential_comments_to_editor: body.confidential_comments_to_editor ?? body.confidentialCommentsToEditor ?? null,
    recommendation: body.recommendation,
    annotations: (body.annotations ?? []).map((a) => ({ selected_text: (a.selected_text ?? a.selectedText ?? "") as string, comment: a.comment, visibility: a.visibility ?? "author_reviewer_editor" })),
  };
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: assignmentId } = await params;
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
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0]?.message ?? "Validation failed" }, { status: 400 });
  const data = normalize(parsed.data);

  // Verify assignment ownership
  const { data: assignment } = await supabase.from("review_assignments").select("id, reviewer_id, review_round_id, status, deadline_at, invitation_id").eq("id", assignmentId).single();
  if (!assignment) return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
  const ass = assignment as { id: string; reviewer_id: string; review_round_id: string; status: string; deadline_at: string | null; invitation_id: string | null };
  const { data: profile } = await supabase.from("reviewer_profiles").select("user_id").eq("id", ass.reviewer_id).single();
  if (!profile || (profile as { user_id: string }).user_id !== user.id) return NextResponse.json({ error: "Forbidden: not your assignment" }, { status: 403 });
  if (ass.status === "completed") return NextResponse.json({ error: "Review already submitted" }, { status: 409 });

  // Upsert report
  const { data: existing } = await supabase.from("review_reports").select("id").eq("review_assignment_id", assignmentId).maybeSingle();
  const reportPayload: Record<string, unknown> = {
    review_assignment_id: assignmentId,
    originality_score: data.originality_score,
    methodology_score: data.methodology_score,
    literature_score: data.literature_score,
    results_score: data.results_score,
    discussion_score: data.discussion_score,
    writing_score: data.writing_score,
    significance_score: data.significance_score,
    comments_to_author: data.comments_to_author || null,
    confidential_comments_to_editor: data.confidential_comments_to_editor || null,
    recommendation: data.recommendation,
    submitted_at: new Date().toISOString(),
  };
  if (existing) {
    const { error } = await supabase.from("review_reports").update(reportPayload as never).eq("id", (existing as { id: string }).id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    const { error } = await supabase.from("review_reports").insert(reportPayload as never);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await supabase.from("review_assignments").update({ status: "completed", completed_at: new Date().toISOString() } as never).eq("id", assignmentId);

  // Annotations — need version_id
  if (data.annotations.length > 0) {
    const { data: round } = await supabase.from("review_rounds").select("manuscript_id").eq("id", ass.review_round_id).single();
    if (round) {
      const manId = (round as { manuscript_id: string }).manuscript_id;
      const { data: version } = await supabase.from("manuscript_versions").select("id").eq("manuscript_id", manId).order("version_number", { ascending: false }).limit(1).maybeSingle();
      const versionId = version ? (version as { id: string }).id : null;
      if (versionId) {
        for (const ann of data.annotations) {
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

  // Audit
  await supabase.from("audit_logs").insert({
    actor_id: user.id,
    manuscript_id: null,
    action: "review_submitted",
    entity_type: "review_assignment",
    entity_id: assignmentId,
    new_data: { recommendation: data.recommendation } as never,
  } as never);

  // Check if round is now complete — update manuscript status and notify editors
  try {
    const completed = await reviewRoundCompleted(supabase as unknown as never, ass.review_round_id);
    if (completed) {
      const { data: round } = await supabase.from("review_rounds").select("manuscript_id").eq("id", ass.review_round_id).single();
      if (round) {
        const manId = (round as { manuscript_id: string }).manuscript_id;
        const { data: man } = await supabase.from("manuscripts").select("journal_id, status, title").eq("id", manId).single();
        if (man && (man as { status: string }).status === "under_review") {
          await supabase.from("manuscripts").update({ status: "reviews_complete" } as never).eq("id", manId);
          await supabase.from("review_rounds").update({ completed_at: new Date().toISOString() } as never).eq("id", ass.review_round_id);
          // After reviews_complete, also set decision_pending automatically so editor can decide
          await supabase.from("manuscripts").update({ status: "decision_pending" } as never).eq("id", manId);
          // Notify editors
          const { data: editors } = await supabase.from("journal_members").select("user_id").eq("journal_id", (man as { journal_id: string }).journal_id).in("role", ["editor", "managing_editor", "editor_in_chief", "section_editor", "journal_manager", "journal_admin", "super_admin"] as never).eq("is_active", true);
          for (const e of (editors ?? []) as Array<{ user_id: string }>) {
            await supabase.from("notifications").insert({
              user_id: e.user_id,
              journal_id: (man as { journal_id: string }).journal_id,
              manuscript_id: manId,
              type: "reviews_complete",
              title: "Reviews completed",
              message: `All required reviews for "${(man as { title: string }).title}" are complete.`,
              action_url: `/editor/manuscripts/${manId}`,
            } as never);
          }
        }
      }
    }
  } catch (e) {
    console.error("review completion check failed", e);
  }

  return NextResponse.json({ data: { assignmentId, status: "completed" } });
}
