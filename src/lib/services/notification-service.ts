import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Core
// ---------------------------------------------------------------------------

export interface CreateNotificationParams {
  userId: string;
  journalId?: string | null;
  manuscriptId?: string | null;
  type: string;
  title: string;
  message: string;
  actionUrl?: string | null;
  metadata?: Record<string, unknown>;
}

export async function createNotification(
  supabase: SupabaseClient,
  params: CreateNotificationParams,
) {
  const { data, error } = await supabase
    .from("notifications")
    .insert({
      user_id: params.userId,
      journal_id: params.journalId ?? null,
      manuscript_id: params.manuscriptId ?? null,
      type: params.type,
      title: params.title,
      message: params.message,
      action_url: params.actionUrl ?? null,
      metadata: (params.metadata ?? {}) as never,
    } as never)
    .select("*")
    .single();

  if (error) {
    console.error("[notifications] insert failed:", error.message);
    // Do not throw — notifications are best-effort.
    return null;
  }
  return data;
}

export async function markNotificationRead(
  supabase: SupabaseClient,
  notificationId: string,
  userId: string,
) {
  const { data, error } = await supabase
    .from("notifications")
    .update({ is_read: true, read_at: new Date().toISOString() } as never)
    .eq("id", notificationId)
    .eq("user_id", userId)
    .select("*")
    .single();

  if (error) throw new Error(`Failed to mark notification as read: ${error.message}`);
  return data;
}

export async function markAllNotificationsRead(
  supabase: SupabaseClient,
  userId: string,
) {
  const { error } = await supabase
    .from("notifications")
    .update({ is_read: true, read_at: new Date().toISOString() } as never)
    .eq("user_id", userId)
    .eq("is_read", false);

  if (error) throw new Error(`Failed to mark all notifications as read: ${error.message}`);
}

export async function getUnreadCount(
  supabase: SupabaseClient,
  userId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("is_read", false);

  if (error) throw new Error(`Failed to fetch unread count: ${error.message}`);
  return count ?? 0;
}

// ---------------------------------------------------------------------------
// Convenience helpers — map domain events to notification content
// ---------------------------------------------------------------------------

export async function notifySubmissionReceived(
  supabase: SupabaseClient,
  params: { editorUserIds: string[]; journalId: string; manuscriptId: string; title: string },
) {
  for (const userId of params.editorUserIds) {
    await createNotification(supabase, {
      userId,
      journalId: params.journalId,
      manuscriptId: params.manuscriptId,
      type: "submission_received",
      title: "New submission received",
      message: `"${params.title}" has been submitted and awaits technical check.`,
      actionUrl: `/editor/submissions/${params.manuscriptId}`,
    });
  }
}

export async function notifyEditorAssigned(
  supabase: SupabaseClient,
  params: { editorUserId: string; journalId: string; manuscriptId: string; title: string },
) {
  await createNotification(supabase, {
    userId: params.editorUserId,
    journalId: params.journalId,
    manuscriptId: params.manuscriptId,
    type: "editor_assigned",
    title: "You have been assigned as editor",
    message: `You are now the handling editor for "${params.title}".`,
    actionUrl: `/editor/manuscripts/${params.manuscriptId}`,
  });
}

export async function notifyReviewerInvited(
  supabase: SupabaseClient,
  params: { reviewerUserId: string; manuscriptId: string; title: string; deadlineAt?: string },
) {
  await createNotification(supabase, {
    userId: params.reviewerUserId,
    manuscriptId: params.manuscriptId,
    type: "reviewer_invited",
    title: "You have been invited to review",
    message: `You are invited to review "${params.title}".${params.deadlineAt ? ` Deadline: ${params.deadlineAt}.` : ""}`,
    actionUrl: `/reviewer/invitations`,
  });
}

export async function notifyReviewsComplete(
  supabase: SupabaseClient,
  params: { editorUserIds: string[]; journalId: string; manuscriptId: string; title: string },
) {
  for (const userId of params.editorUserIds) {
    await createNotification(supabase, {
      userId,
      journalId: params.journalId,
      manuscriptId: params.manuscriptId,
      type: "reviews_complete",
      title: "Reviews completed",
      message: `All required reviews for "${params.title}" are now complete.`,
      actionUrl: `/editor/manuscripts/${params.manuscriptId}`,
    });
  }
}

export async function notifyDecisionMade(
  supabase: SupabaseClient,
  params: {
    authorUserId: string;
    journalId: string;
    manuscriptId: string;
    title: string;
    decision: string;
  },
) {
  await createNotification(supabase, {
    userId: params.authorUserId,
    journalId: params.journalId,
    manuscriptId: params.manuscriptId,
    type: `decision_${params.decision}`,
    title: `Decision: ${params.decision}`,
    message: `A decision has been made for "${params.title}": ${params.decision}.`,
    actionUrl: `/author/submissions/${params.manuscriptId}`,
  });
}
