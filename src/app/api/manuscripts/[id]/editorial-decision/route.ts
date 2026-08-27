import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";
import { getRecommendationForRound } from "@/lib/services/review-service";

const schema = z.object({
  decision: z.enum(["accept", "minor_revision", "major_revision", "reject", "withdrawn", "desk_reject"]),
  reviewRoundId: z.string().uuid().optional().nullable(),
  editorReason: z.string().max(5000).optional(),
  overrideSystemRecommendation: z.boolean().optional().default(false),
});

const STATUS_FOR_DECISION: Record<string, string> = {
  accept: "accepted",
  minor_revision: "minor_revision",
  major_revision: "major_revision",
  reject: "rejected",
  withdrawn: "withdrawn",
  desk_reject: "rejected",
};

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
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
  const { decision, reviewRoundId, editorReason, overrideSystemRecommendation } = parsed.data;

  if (overrideSystemRecommendation && (!editorReason || editorReason.trim().length < 10)) {
    return NextResponse.json({ error: "Override requires a reason (at least 10 characters)." }, { status: 400 });
  }

  // Fetch manuscript
  const { data: manuscript } = await supabase.from("manuscripts").select("id, journal_id, status, current_review_round, title, manuscript_number").eq("id", id).single();
  if (!manuscript) return NextResponse.json({ error: "Manuscript not found" }, { status: 404 });
  const m = manuscript as { id: string; journal_id: string; status: string; current_review_round: number; title: string; manuscript_number: string };

  // Guard: once the APC is paid (or the manuscript is in production), it can no
  // longer be sent back to peer review or rejected. This prevents an accidental
  // decision from pulling a paid manuscript out of the production pipeline.
  const isProductionPhase = ["copyediting", "typesetting", "author_proof", "production_approval", "ready_to_publish", "published"].includes(m.status);
  const revertDecisions = new Set(["minor_revision", "major_revision", "reject", "desk_reject", "withdrawn"]);
  if (isProductionPhase || revertDecisions.has(parsed.data.decision)) {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const admin = createAdminClient();
    const { data: apc } = await admin.from("apcs").select("status").eq("manuscript_id", id).maybeSingle();
    const apcPaid = (apc as { status: string } | null)?.status === "paid";
    if (apcPaid || isProductionPhase) {
      return NextResponse.json({ error: "APC already paid / manuscript is in production. It cannot be sent back to peer review or rejected. Use the production workflow or contact an administrator." }, { status: 409 });
    }
  }

  // Check editor permission
  const { data: membership } = await supabase.from("journal_members").select("role, is_active").eq("user_id", user.id).eq("journal_id", m.journal_id).eq("is_active", true);
  const hasEditor = (membership ?? []).some((r) => ["editor", "managing_editor", "editor_in_chief", "section_editor", "journal_manager", "journal_admin", "super_admin"].includes((r as { role: string }).role));
  if (!hasEditor) return NextResponse.json({ error: "Forbidden: editor role required" }, { status: 403 });

  // Resolve review round
  let resolvedRoundId: string | null = reviewRoundId ?? null;
  let systemRecommendation: string | null = null;
  let counts: { accept: number; minorRevision: number; majorRevision: number; reject: number } | null = null;
  if (!resolvedRoundId) {
    const { data: rounds } = await supabase.from("review_rounds").select("id").eq("manuscript_id", id).eq("round_number", m.current_review_round).maybeSingle();
    if (rounds) resolvedRoundId = (rounds as { id: string }).id;
  }
  if (resolvedRoundId) {
    try {
      const rec = await getRecommendationForRound(supabase as unknown as never, resolvedRoundId);
      systemRecommendation = rec.recommendation;
      counts = { accept: rec.counts.accept, minorRevision: rec.counts.minorRevision, majorRevision: rec.counts.majorRevision, reject: rec.counts.reject };
    } catch {}
  }

  const targetStatus = STATUS_FOR_DECISION[decision];
  if (!targetStatus) return NextResponse.json({ error: "Invalid decision" }, { status: 400 });

  // Insert editorial_decisions
  const { error: decisionErr } = await supabase.from("editorial_decisions").insert({
    manuscript_id: id,
    review_round_id: resolvedRoundId,
    editor_id: user.id,
    decision: decision as never,
    system_recommendation: systemRecommendation as never,
    accept_votes: counts?.accept ?? 0,
    minor_revision_votes: counts?.minorRevision ?? 0,
    major_revision_votes: counts?.majorRevision ?? 0,
    reject_votes: counts?.reject ?? 0,
    editor_reason: editorReason ?? null,
    override_system_recommendation: !!overrideSystemRecommendation,
  } as never);
  if (decisionErr) return NextResponse.json({ error: decisionErr.message }, { status: 500 });

  // Update manuscript status
  const updatePayload: Record<string, unknown> = { status: targetStatus };
  if (targetStatus === "accepted") updatePayload.accepted_at = new Date().toISOString();
  if (targetStatus === "rejected") updatePayload.rejected_at = new Date().toISOString();
  if (targetStatus === "minor_revision" || targetStatus === "major_revision") {
    // Create revision request
    // Will be created after manuscript update
  }

  const { error: updateErr } = await supabase.from("manuscripts").update(updatePayload as never).eq("id", id);
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  // If revision, create revision_requests entry
  if (targetStatus === "minor_revision" || targetStatus === "major_revision") {
    const lastDecisionId = (await supabase.from("editorial_decisions").select("id").eq("manuscript_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle().then((r) => (r.data as { id: string } | null)?.id)) ?? null;
    await supabase.from("revision_requests").insert({
      manuscript_id: id,
      decision_id: lastDecisionId,
      revision_round: m.current_review_round + 1,
      due_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
      instructions: editorReason ?? null,
    } as never);
  }

  // Workflow event + audit
  await supabase.from("workflow_events").insert({
    manuscript_id: id,
    actor_id: user.id,
    from_status: m.status as never,
    to_status: targetStatus as never,
    event_type: "editorial_decision",
    description: `Decision: ${decision}${systemRecommendation ? ` (system: ${systemRecommendation})` : ""}${overrideSystemRecommendation ? " — override" : ""}`,
    metadata: { decision, system_recommendation: systemRecommendation, override: overrideSystemRecommendation } as never,
  } as never);

  await supabase.from("audit_logs").insert({
    actor_id: user.id,
    journal_id: m.journal_id,
    manuscript_id: id,
    action: "editorial_decision",
    entity_type: "manuscript",
    entity_id: id,
    new_data: { decision, targetStatus, override: overrideSystemRecommendation, reason: editorReason } as never,
  } as never);

  // Notify author
  const { data: authorRow } = await supabase.from("manuscripts").select("submitted_by").eq("id", id).single();
  const authorId = (authorRow as { submitted_by: string | null } | null)?.submitted_by;
  if (authorId) {
    await supabase.from("notifications").insert({
      user_id: authorId,
      journal_id: m.journal_id,
      manuscript_id: id,
      type: `decision_${decision}`,
      title: `Decision: ${decision}`,
      message: `Decision for "${m.title}": ${decision}${editorReason ? ` — ${editorReason.slice(0, 150)}` : ""}`,
      action_url: `/author/submissions/${id}`,
    } as never);
  }

  // If accepted, mark review round completed
  if (resolvedRoundId && targetStatus === "accepted") {
    await supabase.from("review_rounds").update({ completed_at: new Date().toISOString() } as never).eq("id", resolvedRoundId);
  }

  return NextResponse.json({ data: { manuscriptId: id, decision, targetStatus, systemRecommendation } });
}
