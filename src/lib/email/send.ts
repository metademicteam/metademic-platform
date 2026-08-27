import "server-only";

import { Resend } from "resend";
import type { SupabaseClient } from "@supabase/supabase-js";
import { renderEmailTemplate } from "@/lib/email/templates";

const STATUS_LIMIT = 10;

/**
 * Send a rendered email via Resend.
 * Returns the provider message id, or throws on failure.
 */
export async function sendEmail(params: {
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM ?? "Metademic <onboarding@resend.dev>";
  if (!apiKey) throw new Error("RESEND_API_KEY is not configured — set it in Vercel/Netlify env and redeploy");

  // Dev convenience: Resend's test mode only delivers to the account owner's
  // email. When EMAIL_DEV_REDIRECT is set, route ALL mail there so you can
  // actually see it during development. Remove it once a production domain is
  // verified and EMAIL_FROM uses that domain.
  const devRedirect = process.env.EMAIL_DEV_REDIRECT;

  const resend = new Resend(apiKey);
  const { data, error } = await resend.emails.send({
    from,
    to: devRedirect || params.to,
    subject: params.subject,
    html: params.html,
    text: params.text,
    replyTo: params.replyTo,
  });

  if (error) throw new Error(error.message);
  return data;
}

interface PendingEmailJob {
  id: string;
  job_type: string;
  payload: {
    template?: string;
    template_name?: string;
    recipient?: string;
    recipient_email?: string;
    subject?: string;
    context?: Record<string, unknown>;
    manuscript_id?: string;
    recipient_user_id?: string;
  };
}

/**
 * Worker: drain pending `send_email` jobs from system_jobs, render the
 * matching template, send via Resend, and record the outcome in email_logs.
 * Returns a summary for the caller.
 */
export async function processPendingEmails(supabase: SupabaseClient) {
  const { data: jobs, error } = await supabase
    .from("system_jobs")
    .select("id, job_type, payload")
    .eq("job_type", "send_email")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(STATUS_LIMIT);

  if (error) throw new Error(`Failed to fetch pending email jobs: ${error.message}`);

  let sent = 0;
  let failed = 0;
  const results: Array<{ jobId: string; status: string; messageId?: string; error?: string }> = [];

  for (const job of (jobs ?? []) as PendingEmailJob[]) {
    const payload = job.payload;
    const template = payload.template_name ?? payload.template;
    const to = payload.recipient_email ?? payload.recipient;
    const subject = payload.subject;

    // Mark processing while we attempt the send.
    await supabase.from("system_jobs").update({ status: "processing", started_at: new Date().toISOString() } as never).eq("id", job.id);

    try {
      if (!template) throw new Error("Missing template_name in payload");
      if (!to) throw new Error("Missing recipient_email in payload");

      const ctx = (payload.context ?? {}) as Record<string, string | undefined>;
      const rendered = renderEmailTemplate(template as never, ctx);

      // Template subject wins unless the payload explicitly overrides it.
      const finalSubject = subject ?? rendered.subject;
      const sendResult = await sendEmail({ to, subject: finalSubject, html: rendered.html, text: rendered.text });

      await supabase.from("system_jobs").update({ status: "completed", completed_at: new Date().toISOString() } as never).eq("id", job.id);

      await supabase.from("email_logs").update({
        status: "sent",
        sent_at: new Date().toISOString(),
        provider: "resend",
        provider_message_id: sendResult?.id ?? null,
        subject: finalSubject,
      } as never).eq("recipient_email", to).eq("status", "queued").eq("template_name", template);

      sent++;
      results.push({ jobId: job.id, status: "sent", messageId: sendResult?.id });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Send failed";
      await supabase.from("system_jobs").update({ status: "failed", completed_at: new Date().toISOString(), error_message: msg } as never).eq("id", job.id);
      await supabase.from("email_logs").update({ status: "failed", error_message: msg } as never).eq("recipient_email", to ?? "").eq("status", "queued").eq("template_name", template ?? "");
      failed++;
      results.push({ jobId: job.id, status: "failed", error: msg });
    }
  }

  return { sent, failed, results };
}
