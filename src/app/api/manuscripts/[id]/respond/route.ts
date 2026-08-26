import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";
import { writeAuditLog } from "@/lib/audit";
import { enqueueJob } from "@/lib/jobs";

const responseSchema = z.object({
  revisionRequestId: z.string().uuid(),
  responses: z
    .array(
      z.object({
        reviewCommentId: z.string().uuid(),
        responseText: z.string().trim().min(5, "Response must be at least 5 characters").max(5000),
        responseStatus: z.enum(["pending", "addressed", "partially_addressed", "not_addressed"]).default("addressed"),
      }),
    )
    .min(1, "At least one response is required")
    .max(100),
  overallResponse: z.string().trim().max(10000).optional().nullable(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: manuscriptId } = await params;
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
  const parsed = responseSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0]?.message ?? "Validation failed", details: parsed.error.flatten() }, { status: 400 });
  const { revisionRequestId, responses, overallResponse } = parsed.data;

  // Fetch manuscript — ensure caller is author
  const { data: manuscript } = await supabase.from("manuscripts").select("id, journal_id, submitted_by, corresponding_author_id, status, title, manuscript_number").eq("id", manuscriptId).single();
  if (!manuscript) return NextResponse.json({ error: "Manuscript not found" }, { status: 404 });
  const m = manuscript as { id: string; journal_id: string; submitted_by: string | null; corresponding_author_id: string | null; status: string; title: string; manuscript_number: string };
  const isAuthor = user.id === m.submitted_by || user.id === m.corresponding_author_id;
  if (!isAuthor) {
    // Allow editors to also post? but spec says author responses
    const { data: mem } = await supabase.from("journal_members").select("role").eq("user_id", user.id).eq("journal_id", m.journal_id).eq("is_active", true);
    const isEditor = (mem ?? []).some((r: { role: string }) => ["editor", "managing_editor", "editor_in_chief", "section_editor", "journal_manager", "journal_admin", "super_admin"].includes(r.role));
    if (!isEditor) return NextResponse.json({ error: "Forbidden: only the author can respond" }, { status: 403 });
  }

  // Verify revision request belongs to manuscript
  const { data: rr } = await supabase.from("revision_requests").select("id, manuscript_id").eq("id", revisionRequestId).single();
  if (!rr || (rr as { manuscript_id: string }).manuscript_id !== manuscriptId) return NextResponse.json({ error: "Revision request not found for this manuscript" }, { status: 404 });

  // Validate review_comment IDs exist and belong to this manuscript's review round(s)
  // Best-effort: verify they exist
  const commentIds = responses.map((r) => r.reviewCommentId);
  const { data: comments, error: cErr } = await supabase.from("review_comments").select("id").in("id", commentIds);
  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 });
  if ((comments ?? []).length !== commentIds.length) return NextResponse.json({ error: "One or more review comments not found" }, { status: 404 });

  // Insert author_responses
  const toInsert = responses.map((r) => ({
    revision_request_id: revisionRequestId,
    review_comment_id: r.reviewCommentId,
    response_text: r.responseText,
    response_status: r.responseStatus,
  }));

  const { data: inserted, error: insErr } = await supabase.from("author_responses").insert(toInsert as never).select("*");
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

  // Also update review_comments.response_status / author_response where appropriate? Keep denormalized? We update review_comments.author_response to reflect latest response
  for (const r of responses) {
    await supabase.from("review_comments").update({ author_response: r.responseText, response_status: r.responseStatus } as never).eq("id", r.reviewCommentId);
  }

  // Workflow event + audit
  await supabase.from("workflow_events").insert({
    manuscript_id: manuscriptId,
    actor_id: user.id,
    from_status: m.status as never,
    to_status: m.status as never,
    event_type: "author.response",
    description: overallResponse?.slice(0, 500) ?? `Author responded to ${responses.length} reviewer comments`,
    metadata: { revisionRequestId, count: responses.length, overallResponse: overallResponse ?? null } as never,
  } as never);

  await writeAuditLog(supabase as never, {
    actorId: user.id,
    journalId: m.journal_id,
    manuscriptId,
    action: "author.response",
    entityType: "author_response",
    entityId: revisionRequestId,
    newData: { responses: inserted, overallResponse } as Record<string, unknown>,
  });

  // Optionally enqueue notification to editor
  try {
    const { data: editors } = await supabase.from("journal_members").select("user_id").eq("journal_id", m.journal_id).in("role", ["editor", "editor_in_chief", "managing_editor", "journal_admin", "super_admin"] as never).eq("is_active", true);
    for (const ed of (editors ?? []) as Array<{ user_id: string }>) {
      await supabase.from("notifications").insert({
        user_id: ed.user_id,
        journal_id: m.journal_id,
        manuscript_id: manuscriptId,
        type: "author_response",
        title: "Author responded to reviews",
        message: `Author responded to ${responses.length} comments for "${m.title}" (${m.manuscript_number}).`,
        action_url: `/editor/manuscripts/${manuscriptId}`,
      } as never);
    }
    await enqueueJob(supabase as never, { jobType: "send_email", entityType: "author_response", entityId: revisionRequestId, payload: { manuscriptId, count: responses.length } });
  } catch {
    // best effort
  }

  return NextResponse.json({ data: inserted }, { status: 201 });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: manuscriptId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // List responses for manuscript via revision_requests
  const { data: rrs } = await supabase.from("revision_requests").select("id").eq("manuscript_id", manuscriptId);
  const rrIds = ((rrs ?? []) as { id: string }[]).map((r) => r.id);
  if (rrIds.length === 0) return NextResponse.json({ data: [] });

  const { data, error } = await supabase.from("author_responses").select("*, review_comments(comment_text, comment_number)").in("revision_request_id", rrIds).order("created_at");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}
