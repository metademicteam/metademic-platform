// supabase/functions/cron-dispatcher/index.ts
// Invoked by pg_cron every hour/day via pg_net.http_post
// Processes: overdue reviews, pending invitations, stale manuscripts, system_jobs, and triggers notifications

import { handleCors, jsonResponse } from "../_shared/cors.ts";
import { getServiceClient } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const service = getServiceClient();
  const url = new URL(req.url);
  const job = url.searchParams.get("job") || (await req.json().catch(() => ({}))).job as string || "all";
  const results: Record<string, unknown> = {};

  console.log(`[cron-dispatcher] job=${job} at ${new Date().toISOString()}`);

  if (job === "all" || job === "overdue") {
    results.overdue = await processOverdue(service);
  }
  if (job === "all" || job === "reminders") {
    results.reminders = await processReminders(service);
  }
  if (job === "all" || job === "stale") {
    results.stale = await processStaleManuscripts(service);
  }
  if (job === "all" || job === "system_jobs") {
    results.system_jobs = await processSystemJobs(service);
  }
  if (job === "all" || job === "auto_transition") {
    results.auto_transition = await autoTransition(service);
  }

  return jsonResponse({ ok: true, job, results, at: new Date().toISOString() });
});

async function processOverdue(service: ReturnType<typeof getServiceClient>) {
  // Mark review_assignments where deadline_at < now() and status not completed
  const { data: overdue } = await service
    .from("review_assignments")
    .select("id,reviewer_id,review_round_id,deadline_at,manuscripts!inner(id,title,manuscript_number,journal_id),review_rounds!inner(manuscript_id)")
    .lt("deadline_at", new Date().toISOString())
    .in("status", ["invited", "accepted", "reviewing"] as never)
    .limit(50);

  let count = 0;
  for (const a of (overdue ?? []) as Array<{ id: string; reviewer_id: string; manuscripts: { id: string; title: string; manuscript_number: string; journal_id: string } }>) {
    await service.from("review_assignments").update({ status: "overdue" as never, reminder_count: (a as unknown as { reminder_count: number }).reminder_count + 1 } as never).eq("id", a.id);
    // Increment reviewer overdue count
    await service.from("reviewer_profiles").update({ overdue_reviews: (await getOverdueCount(service, a.reviewer_id)) + 1 } as never).eq("id", a.reviewer_id);
    // Notify reviewer
    const { data: rp } = await service.from("reviewer_profiles").select("user_id").eq("id", a.reviewer_id).maybeSingle();
    const uid = (rp as { user_id: string } | null)?.user_id;
    if (uid) {
      await service.from("notifications").insert({
        user_id: uid,
        journal_id: a.manuscripts.journal_id,
        manuscript_id: a.manuscripts.id,
        type: "review_overdue",
        title: "Review overdue",
        message: `Your review for ${a.manuscripts.manuscript_number} is overdue. Please submit as soon as possible.`,
        action_url: `/reviewer/reviews/${a.id}`,
      } as never);
    }
    // Notify editors
    const { data: editors } = await service.from("journal_members").select("user_id").eq("journal_id", a.manuscripts.journal_id).in("role", ["editor", "editor_in_chief", "managing_editor"] as never).eq("is_active", true).limit(5);
    for (const ed of (editors ?? []) as Array<{ user_id: string }>) {
      await service.from("notifications").insert({
        user_id: ed.user_id,
        journal_id: a.manuscripts.journal_id,
        manuscript_id: a.manuscripts.id,
        type: "reviewer_overdue_admin",
        title: "Reviewer overdue",
        message: `Reviewer for ${a.manuscripts.manuscript_number} is overdue.`,
        action_url: `/editor/manuscripts/${a.manuscripts.id}`,
      } as never);
    }
    count++;
  }
  console.log(`[cron] overdue processed ${count}`);
  return { count };
}

async function getOverdueCount(service: ReturnType<typeof getServiceClient>, reviewerId: string): Promise<number> {
  const { data } = await service.from("reviewer_profiles").select("overdue_reviews").eq("id", reviewerId).maybeSingle();
  return (data as { overdue_reviews: number } | null)?.overdue_reviews ?? 0;
}

async function processReminders(service: ReturnType<typeof getServiceClient>) {
  // Remind for invitations where invited_at < now() - 3 days and status invited
  const threeDaysAgo = new Date(Date.now() - 3 * 86400000).toISOString();
  const { data: pending } = await service
    .from("reviewer_invitations")
    .select("id,reviewer_id,review_round_id,invited_at,review_rounds!inner(manuscript_id), reviewer_profiles!inner(user_id)")
    .eq("status", "invited" as never)
    .lt("invited_at", threeDaysAgo)
    .limit(50);
  let count = 0;
  for (const inv of (pending ?? []) as Array<{ id: string; reviewer_id: string; review_rounds: { manuscript_id: string }; reviewer_profiles: { user_id: string } }>) {
    const uid = inv.reviewer_profiles.user_id;
    const { data: ms } = await service.from("manuscripts").select("manuscript_number,journal_id").eq("id", inv.review_rounds.manuscript_id).maybeSingle();
    if (!ms) continue;
    await service.from("notifications").insert({
      user_id: uid,
      journal_id: (ms as { journal_id: string }).journal_id,
      manuscript_id: inv.review_rounds.manuscript_id,
      type: "reviewer_reminder",
      title: "Reminder: review invitation pending",
      message: `You have a pending review invitation for ${(ms as { manuscript_number: string }).manuscript_number}. Please respond.`,
      action_url: `/reviewer/invitations`,
    } as never);
    await service.from("review_assignments").update({ reminder_count: 1 } as never).eq("reviewer_id", inv.reviewer_id).eq("review_round_id", inv.review_rounds.manuscript_id as unknown as string);
    count++;
  }
  console.log(`[cron] reminders ${count}`);
  return { count };
}

async function processStaleManuscripts(service: ReturnType<typeof getServiceClient>) {
  // Manuscripts in submitted > 24h without technical_check
  const oneDayAgo = new Date(Date.now() - 86400000).toISOString();
  const { data: stale } = await service.from("manuscripts").select("id,manuscript_number,journal_id,submitted_at").eq("status", "submitted").lt("submitted_at", oneDayAgo).limit(20);
  let count = 0;
  for (const ms of (stale ?? []) as Array<{ id: string; manuscript_number: string; journal_id: string }>) {
    const { data: editors } = await service.from("journal_members").select("user_id").eq("journal_id", ms.journal_id).in("role", ["managing_editor", "journal_admin", "super_admin"] as never).eq("is_active", true).limit(5);
    for (const ed of (editors ?? []) as Array<{ user_id: string }>) {
      await service.from("notifications").insert({
        user_id: ed.user_id,
        journal_id: ms.journal_id,
        manuscript_id: ms.id,
        type: "stale_submission",
        title: "Stale submission requires attention",
        message: `Manuscript ${ms.manuscript_number} has been in submitted state for >24h. Please perform technical check.`,
        action_url: `/editor/manuscripts/${ms.id}`,
      } as never);
    }
    count++;
  }
  return { count };
}

async function processSystemJobs(service: ReturnType<typeof getServiceClient>) {
  // Pick 10 pending jobs and mark processing (simulated send_email, doi, etc.)
  const { data: jobs } = await service.from("system_jobs").select("id,job_type,payload").eq("status", "pending").order("created_at", { ascending: true }).limit(10);
  let count = 0;
  for (const job of (jobs ?? []) as Array<{ id: string; job_type: string; payload: Record<string, unknown> }>) {
    await service.from("system_jobs").update({ status: "processing" as never, started_at: new Date().toISOString(), attempts: 1 } as never).eq("id", job.id);
    // Simulate processing: for send_email, mark completed and update email_logs
    if (job.job_type === "send_email") {
      const recipient = (job.payload as { recipient?: string }).recipient;
      if (recipient) {
        await service.from("email_logs").update({ status: "sent" as never, sent_at: new Date().toISOString() } as never).eq("recipient_email", recipient as never).eq("status", "queued" as never);
      }
      await service.from("system_jobs").update({ status: "completed" as never, completed_at: new Date().toISOString() } as never).eq("id", job.id);
    } else if (job.job_type === "doi_registration") {
      // Simulate Crossref deposit: mark doi_records queued → registered after 1 attempt
      const articleId = (job.payload as { article_id?: string }).article_id;
      if (articleId) {
        await service.from("doi_records").update({ registration_status: "registered" as never, registered_at: new Date().toISOString() } as never).eq("article_id", articleId as never);
      }
      await service.from("system_jobs").update({ status: "completed" as never, completed_at: new Date().toISOString() } as never).eq("id", job.id);
    } else {
      await service.from("system_jobs").update({ status: "completed" as never, completed_at: new Date().toISOString() } as never).eq("id", job.id);
    }
    count++;
  }
  return { count };
}

async function autoTransition(service: ReturnType<typeof getServiceClient>) {
  // Already handled in workflow-engine, but also ensure manuscripts stuck in reviews_complete move to decision_pending
  const { data: stuck } = await service.from("manuscripts").select("id,journal_id").eq("status", "reviews_complete").limit(10);
  let count = 0;
  for (const ms of (stuck ?? []) as Array<{ id: string; journal_id: string }>) {
    const { data: round } = await service.from("review_rounds").select("id").eq("manuscript_id", ms.id).order("round_number", { ascending: false }).limit(1).maybeSingle();
    if (!round) continue;
    const { data: rec } = await service.rpc("calculate_review_recommendation", { p_review_round_id: (round as { id: string }).id });
    if (rec && rec !== "no_recommendation") {
      await service.from("manuscripts").update({ status: "decision_pending" as never }).eq("id", ms.id);
      count++;
    }
  }
  return { count };
}
