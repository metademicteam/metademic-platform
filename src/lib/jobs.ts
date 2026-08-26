import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * System jobs abstraction — TASK §32/33/55.
 * Every async / side-effect operation should enqueue a row in `public.system_jobs`.
 * A separate worker (Supabase Edge Function / cron / external NestJS) picks up pending jobs.
 *
 * Job types supported:
 *  - send_email
 *  - reviewer_reminder
 *  - mark_overdue
 *  - calculate_apc
 *  - generate_invoice
 *  - doi_registration
 *  - generate_pdf / generate_xml / generate_html
 *  - acceptance_letter
 */

export const JOB_TYPES = [
  "send_email",
  "reviewer_reminder",
  "mark_overdue",
  "calculate_apc",
  "generate_invoice",
  "doi_registration",
  "generate_pdf",
  "generate_xml",
  "generate_html",
  "acceptance_letter",
  "publication",
] as const;

export type JobType = (typeof JOB_TYPES)[number];
export type JobStatus = "pending" | "processing" | "completed" | "failed" | "cancelled";

export interface EnqueueJobParams {
  jobType: JobType | string;
  entityType?: string | null;
  entityId?: string | null;
  payload?: Record<string, unknown>;
  scheduledAt?: string | null;
  maxAttempts?: number;
}

export async function enqueueJob(
  supabase: SupabaseClient,
  params: EnqueueJobParams,
) {
  const { data, error } = await supabase
    .from("system_jobs")
    .insert({
      job_type: params.jobType,
      entity_type: params.entityType ?? null,
      entity_id: params.entityId ?? null,
      status: "pending",
      payload: (params.payload ?? {}) as never,
      scheduled_at: params.scheduledAt ?? new Date().toISOString(),
      max_attempts: params.maxAttempts ?? 5,
    } as never)
    .select("*")
    .single();

  if (error) throw new Error(`Failed to enqueue job ${params.jobType}: ${error.message}`);
  return data;
}

export async function enqueueEmailJob(
  supabase: SupabaseClient,
  params: {
    templateName: string;
    recipientEmail: string;
    recipientUserId?: string | null;
    manuscriptId?: string | null;
    subject?: string;
    context?: Record<string, unknown>;
  },
) {
  return enqueueJob(supabase, {
    jobType: "send_email",
    entityType: params.manuscriptId ? "manuscript" : "user",
    entityId: params.manuscriptId ?? params.recipientUserId ?? null,
    payload: {
      template_name: params.templateName,
      recipient_email: params.recipientEmail,
      recipient_user_id: params.recipientUserId ?? null,
      manuscript_id: params.manuscriptId ?? null,
      subject: params.subject ?? null,
      context: params.context ?? {},
    },
  });
}

export async function enqueueReviewerReminder(
  supabase: SupabaseClient,
  assignmentId: string,
  payload?: Record<string, unknown>,
) {
  return enqueueJob(supabase, {
    jobType: "reviewer_reminder",
    entityType: "review_assignment",
    entityId: assignmentId,
    payload: payload ?? {},
  });
}

export async function enqueueMarkOverdue(
  supabase: SupabaseClient,
  assignmentId: string,
) {
  return enqueueJob(supabase, {
    jobType: "mark_overdue",
    entityType: "review_assignment",
    entityId: assignmentId,
    payload: {},
  });
}

export async function enqueueCalculateApc(
  supabase: SupabaseClient,
  manuscriptId: string,
  payload?: Record<string, unknown>,
) {
  return enqueueJob(supabase, {
    jobType: "calculate_apc",
    entityType: "manuscript",
    entityId: manuscriptId,
    payload: payload ?? {},
  });
}

export async function enqueueGenerateInvoice(
  supabase: SupabaseClient,
  apcId: string,
  payload?: Record<string, unknown>,
) {
  return enqueueJob(supabase, {
    jobType: "generate_invoice",
    entityType: "apc",
    entityId: apcId,
    payload: payload ?? {},
  });
}

export async function enqueueDoiRegistration(
  supabase: SupabaseClient,
  articleId: string,
  payload?: Record<string, unknown>,
) {
  return enqueueJob(supabase, {
    jobType: "doi_registration",
    entityType: "article",
    entityId: articleId,
    payload: payload ?? {},
  });
}

export async function enqueueAcceptanceLetter(
  supabase: SupabaseClient,
  manuscriptId: string,
  payload?: Record<string, unknown>,
) {
  return enqueueJob(supabase, {
    jobType: "acceptance_letter",
    entityType: "manuscript",
    entityId: manuscriptId,
    payload: payload ?? {},
  });
}

export async function retryJob(
  supabase: SupabaseClient,
  jobId: string,
) {
  const { data: job, error: fetchErr } = await supabase
    .from("system_jobs")
    .select("id, status, attempts, max_attempts")
    .eq("id", jobId)
    .single();
  if (fetchErr || !job) throw new Error("Job not found");

  const j = job as { status: string; attempts: number; max_attempts: number };
  if (j.status === "completed") throw new Error("Cannot retry a completed job");
  if (j.attempts >= j.max_attempts) {
    // bump max_attempts to allow one more try if explicitly requested
  }

  const { data, error } = await supabase
    .from("system_jobs")
    .update({
      status: "pending",
      error_message: null,
      scheduled_at: new Date().toISOString(),
    } as never)
    .eq("id", jobId)
    .select("*")
    .single();

  if (error) throw new Error(`Failed to retry job: ${error.message}`);
  return data;
}

export async function listJobs(
  supabase: SupabaseClient,
  params: { status?: string; jobType?: string; page?: number; pageSize?: number } = {},
) {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 20));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("system_jobs")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (params.status && params.status !== "all") query = query.eq("status", params.status as never);
  if (params.jobType && params.jobType !== "all") query = query.eq("job_type", params.jobType as never);

  const { data, error, count } = await query;
  if (error) throw new Error(error.message);
  return { data: data ?? [], count: count ?? 0, page, pageSize };
}
