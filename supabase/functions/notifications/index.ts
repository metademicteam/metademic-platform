// supabase/functions/notifications/index.ts
// Dedicated notification dispatcher — can be called by triggers or cron
// Handles: reviewer invitation → reviewer, admin decision → author, etc.

import { handleCors, jsonResponse, errorResponse } from "../_shared/cors.ts";
import { getServiceClient } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const service = getServiceClient();
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* ignore */ }

  const type = body.type as string;
  const manuscript_id = body.manuscript_id as string;
  const journal_id = body.journal_id as string;
  const user_id = body.user_id as string | undefined;
  const reviewer_id = body.reviewer_id as string | undefined;

  if (!type || !manuscript_id) return errorResponse("type and manuscript_id required", 400);

  // Fetch manuscript for context
  const { data: ms } = await service.from("manuscripts").select("id,title,manuscript_number,journal_id").eq("id", manuscript_id).maybeSingle();
  if (!ms) return errorResponse("Manuscript not found", 404);
  const m = ms as { title: string; manuscript_number: string; journal_id: string };

  const jId = journal_id || m.journal_id;

  switch (type) {
    case "reviewer_invited": {
      // Find reviewer user from reviewer_profiles
      if (!reviewer_id) return errorResponse("reviewer_id required for reviewer_invited", 400);
      const { data: rp } = await service.from("reviewer_profiles").select("user_id").eq("id", reviewer_id).maybeSingle();
      const uid = (rp as { user_id: string } | null)?.user_id;
      if (!uid) return errorResponse("Reviewer profile not found", 404);
      await service.from("notifications").insert({
        user_id: uid,
        journal_id: jId,
        manuscript_id,
        type: "reviewer_invited",
        title: "Review invitation",
        message: `You have been invited to review "${m.title}" (${m.manuscript_number}). Please respond within 3 days.`,
        action_url: `/reviewer/invitations`,
      } as never);
      await queueEmail(service, uid, manuscript_id, "reviewer_invited", "Review invitation", `You have been invited to review ${m.manuscript_number}`);
      return jsonResponse({ ok: true, notified: uid });
    }
    case "reviewer_accepted": {
      // Notify editors that reviewer accepted
      const { data: members } = await service.from("journal_members").select("user_id").eq("journal_id", jId).in("role", ["editor", "editor_in_chief", "managing_editor"] as never).eq("is_active", true);
      for (const mem of (members ?? []) as Array<{ user_id: string }>) {
        await service.from("notifications").insert({
          user_id: mem.user_id,
          journal_id: jId,
          manuscript_id,
          type: "reviewer_accepted",
          title: "Reviewer accepted",
          message: `A reviewer has accepted to review ${m.manuscript_number}.`,
          action_url: `/editor/manuscripts/${manuscript_id}`,
        } as never);
      }
      return jsonResponse({ ok: true, editors_notified: members?.length ?? 0 });
    }
    case "decision_made": {
      const decision = body.decision as string;
      if (!user_id) return errorResponse("user_id (author) required", 400);
      const titles: Record<string, string> = {
        accepted: "Manuscript accepted",
        rejected: "Decision on your manuscript",
        minor_revision: "Minor revision requested",
        major_revision: "Major revision requested",
      };
      await service.from("notifications").insert({
        user_id,
        journal_id: jId,
        manuscript_id,
        type: `decision_${decision}`,
        title: titles[decision] || `Decision: ${decision}`,
        message: `Decision for ${m.manuscript_number}: ${decision}. Please check your dashboard.`,
        action_url: `/author/submissions/${manuscript_id}`,
      } as never);
      await queueEmail(service, user_id, manuscript_id, `decision_${decision}`, titles[decision] || decision, `Decision for ${m.manuscript_number}: ${decision}`);
      return jsonResponse({ ok: true });
    }
    case "author_submitted": {
      // Author submitted → notify editors (same as workflow-engine but direct)
      const { data: editors } = await service.from("journal_members").select("user_id").eq("journal_id", jId).in("role", ["editor", "managing_editor", "editor_in_chief", "journal_admin"] as never).eq("is_active", true);
      for (const e of (editors ?? []) as Array<{ user_id: string }>) {
        await service.from("notifications").insert({
          user_id: e.user_id, journal_id: jId, manuscript_id,
          type: "manuscript_submitted",
          title: "New submission",
          message: `New manuscript ${m.manuscript_number} submitted: "${m.title}"`,
          action_url: `/editor/manuscripts/${manuscriptIdFromBody(body)}`,
        } as never);
      }
      return jsonResponse({ ok: true });
    }
    default:
      // Generic notification
      if (!user_id) return errorResponse("user_id required for generic notification", 400);
      await service.from("notifications").insert({
        user_id, journal_id: jId, manuscript_id,
        type, title: (body.title as string) || type, message: (body.message as string) || "",
        action_url: (body.action_url as string) || `/author/submissions/${manuscript_id}`,
      } as never);
      return jsonResponse({ ok: true });
  }
});

function manuscriptIdFromBody(body: Record<string, unknown>): string {
  return (body.manuscript_id as string) || "";
}

async function queueEmail(service: ReturnType<typeof getServiceClient>, userId: string, manuscriptId: string, template: string, subject: string, _body: string) {
  const { data: profile } = await service.from("profiles").select("email").eq("id", userId).maybeSingle();
  const email = (profile as { email: string } | null)?.email;
  if (!email) return;
  await service.from("email_logs").insert({
    user_id: userId,
    manuscript_id: manuscriptId,
    recipient_email: email,
    template_name: template,
    subject,
    status: "queued",
  } as never);
  await service.from("system_jobs").insert({
    job_type: "send_email",
    entity_type: "manuscript",
    entity_id: manuscriptId,
    status: "pending",
    payload: { template, recipient: email, manuscript_id: manuscriptId },
  } as never);
}
