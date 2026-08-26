// supabase/functions/workflow-engine/index.ts
// Automatic workflow engine — invoked by pg_cron or DB triggers via http_post
// Handles: author submit → reviewer notification → admin decision flow

import { handleCors, jsonResponse, errorResponse } from "../_shared/cors.ts";
import { getServiceClient } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const service = getServiceClient();
  let body: Record<string, unknown> = {};
  try {
    if (req.headers.get("content-type")?.includes("application/json")) {
      body = await req.json();
    }
  } catch { /* ignore */ }

  const action = (body.action as string) || new URL(req.url).searchParams.get("action") || "process_all";
  const manuscriptId = body.manuscript_id as string | undefined;

  console.log(`[workflow-engine] action=${action} manuscript_id=${manuscriptId}`);

  if (action === "manuscript_submitted" && manuscriptId) {
    return await handleManuscriptSubmitted(service, manuscriptId);
  }

  if (action === "review_submitted" && manuscriptId) {
    return await handleReviewSubmitted(service, manuscriptId);
  }

  if (action === "process_all") {
    // Process all pending transitions that can be automated
    const results: Record<string, unknown>[] = [];
    // 1. Auto-notify reviewers for manuscripts in reviewer_invitation
    const { data: pendingInvitations } = await service.from("manuscripts").select("id,journal_id,title").eq("status", "reviewer_invitation").limit(10);
    for (const ms of (pendingInvitations ?? []) as Array<{ id: string; journal_id: string; title: string }>) {
      // Ensure review_round exists
      const { data: existing } = await service.from("review_rounds").select("id").eq("manuscript_id", ms.id).eq("round_number", 1).maybeSingle();
      if (!existing) {
        const { data: journal } = await service.from("journals").select("reviewers_required").eq("id", ms.journal_id).maybeSingle();
        const required = (journal as { reviewers_required: number } | null)?.reviewers_required ?? 3;
        await service.from("review_rounds").insert({ manuscript_id: ms.id, round_number: 1, required_reviewers: required } as never);
        results.push({ manuscript_id: ms.id, action: "created_review_round", required });
      }
      // Notify editors to invite reviewers
      await notifyJournalRole(service, ms.journal_id, ms.id, ["editor", "editor_in_chief", "managing_editor", "journal_admin"], "reviewer_invitation", `Action required: invite reviewers`, `Manuscript "${ms.title}" is awaiting reviewer invitations.`);
    }

    // 2. Auto-transition under_review → reviews_complete when round completed
    const { data: underReview } = await service.from("manuscripts").select("id,current_review_round").eq("status", "under_review").limit(10);
    for (const ms of (underReview ?? []) as Array<{ id: string; current_review_round: number }>) {
      const { data: round } = await service.from("review_rounds").select("id").eq("manuscript_id", ms.id).eq("round_number", ms.current_review_round || 1).maybeSingle();
      if (round) {
        const { data: completed } = await service.rpc("review_round_completed", { p_review_round_id: (round as { id: string }).id });
        if (completed) {
          await service.from("manuscripts").update({ status: "reviews_complete" as never }).eq("id", ms.id);
          await service.from("workflow_events").insert({ manuscript_id: ms.id, to_status: "reviews_complete", event_type: "workflow.auto:reviews_complete" } as never);
          await notifyJournalRole(service, (await getJournalId(service, ms.id))!, ms.id, ["editor", "editor_in_chief", "managing_editor"], "reviews_complete", "Reviews complete", `All reviews for manuscript ${ms.id} are complete. Please make a decision.`);
          results.push({ manuscript_id: ms.id, action: "auto_reviews_complete" });
        }
      }
    }

    // 3. Auto-calculate recommendation and notify when reviews_complete
    const { data: reviewsComplete } = await service.from("manuscripts").select("id,journal_id").eq("status", "reviews_complete").limit(10);
    for (const ms of (reviewsComplete ?? []) as Array<{ id: string; journal_id: string }>) {
      const { data: round } = await service.from("review_rounds").select("id").eq("manuscript_id", ms.id).order("round_number", { ascending: false }).limit(1).maybeSingle();
      if (round) {
        const { data: rec } = await service.rpc("calculate_review_recommendation", { p_review_round_id: (round as { id: string }).id });
        if (rec && rec !== "no_recommendation") {
          await service.from("manuscripts").update({ status: "decision_pending" as never }).eq("id", ms.id);
          await service.from("workflow_events").insert({ manuscript_id: ms.id, to_status: "decision_pending", event_type: `workflow.auto:decision_pending rec=${rec}` } as never);
          await notifyJournalRole(service, ms.journal_id, ms.id, ["editor", "editor_in_chief"], "decision_pending", `Decision pending: ${rec}`, `System recommendation is ${rec}. Please confirm or override.`);
          results.push({ manuscript_id: ms.id, action: "auto_decision_pending", recommendation: rec });
        }
      }
    }

    return jsonResponse({ ok: true, processed: results.length, results });
  }

  return errorResponse(`Unknown action: ${action}`, 400);
});

async function handleManuscriptSubmitted(service: ReturnType<typeof getServiceClient>, manuscriptId: string) {
  const { data: ms } = await service.from("manuscripts").select("id,journal_id,title,submitted_by,manuscript_number").eq("id", manuscriptId).maybeSingle();
  if (!ms) return errorResponse("Manuscript not found", 404);
  const m = ms as { id: string; journal_id: string; title: string; submitted_by: string; manuscript_number: string };
  // Notify editors/admins
  await notifyJournalRole(service, m.journal_id, m.id, ["editor", "editor_in_chief", "managing_editor", "section_editor", "journal_admin", "super_admin"], "manuscript_submitted", "New submission received", `New manuscript ${m.manuscript_number}: "${m.title}" has been submitted. Please perform technical check.`);
  // Notify author
  await service.from("notifications").insert({
    user_id: m.submitted_by,
    journal_id: m.journal_id,
    manuscript_id: m.id,
    type: "submission_received",
    title: "Submission received",
    message: `Your manuscript ${m.manuscript_number} has been received and is awaiting technical check.`,
    action_url: `/author/submissions/${m.id}`,
  } as never);
  // Create system job
  await service.from("system_jobs").insert({ job_type: "technical_check", entity_type: "manuscript", entity_id: m.id, status: "pending", payload: { manuscript_id: m.id } } as never);
  // Audit
  await service.from("audit_logs").insert({ actor_id: m.submitted_by, journal_id: m.journal_id, manuscript_id: m.id, action: "workflow.auto:manuscript_submitted" } as never);
  return jsonResponse({ ok: true, manuscript_id: m.id, notified: true });
}

async function handleReviewSubmitted(service: ReturnType<typeof getServiceClient>, manuscriptId: string) {
  const { data: ms } = await service.from("manuscripts").select("id,journal_id").eq("id", manuscriptId).maybeSingle();
  if (!ms) return errorResponse("Manuscript not found", 404);
  const m = ms as { journal_id: string };
  // Check if round completed
  const { data: round } = await service.from("review_rounds").select("id").eq("manuscript_id", manuscriptId).order("round_number", { ascending: false }).limit(1).maybeSingle();
  if (!round) return jsonResponse({ ok: true, message: "No round" });
  const { data: completed } = await service.rpc("review_round_completed", { p_review_round_id: (round as { id: string }).id });
  if (completed) {
    await service.from("manuscripts").update({ status: "reviews_complete" as never }).eq("id", manuscriptId);
    await notifyJournalRole(service, m.journal_id, manuscriptId, ["editor", "editor_in_chief"], "reviews_complete", "Reviews complete", `Reviews for manuscript ${manuscriptId} are complete.`);
  }
  return jsonResponse({ ok: true, completed });
}

async function getJournalId(service: ReturnType<typeof getServiceClient>, manuscriptId: string): Promise<string | null> {
  const { data } = await service.from("manuscripts").select("journal_id").eq("id", manuscriptId).maybeSingle();
  return (data as { journal_id: string } | null)?.journal_id ?? null;
}

async function notifyJournalRole(
  service: ReturnType<typeof getServiceClient>,
  journalId: string,
  manuscriptId: string,
  roles: string[],
  type: string,
  title: string,
  message: string,
) {
  const { data: members } = await service.from("journal_members").select("user_id,role").eq("journal_id", journalId).in("role", roles as never).eq("is_active", true);
  const userIds = [...new Set((members ?? []).map((m: { user_id: string }) => m.user_id))];
  for (const uid of userIds) {
    await service.from("notifications").insert({
      user_id: uid,
      journal_id: journalId,
      manuscript_id: manuscriptId,
      type,
      title,
      message,
      action_url: `/editor/manuscripts/${manuscriptId}`,
    } as never);
    // Also queue email
    const { data: profile } = await service.from("profiles").select("email").eq("id", uid).maybeSingle();
    if (profile) {
      await service.from("email_logs").insert({
        user_id: uid,
        manuscript_id: manuscriptId,
        recipient_email: (profile as { email: string }).email,
        template_name: type,
        subject: title,
        status: "queued",
      } as never);
      await service.from("system_jobs").insert({
        job_type: "send_email",
        entity_type: "manuscript",
        entity_id: manuscriptId,
        status: "pending",
        payload: { template: type, recipient: (profile as { email: string }).email, manuscript_id: manuscriptId },
      } as never);
    }
  }
}
