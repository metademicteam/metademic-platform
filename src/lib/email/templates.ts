/**
 * Email template definitions per TASK.md §38.
 * Each template is a pure function returning subject + html + text.
 * Sending is done elsewhere (service/worker) — this file only renders content.
 */

export type EmailTemplateName =
  | "submission_received"
  | "editor_assigned"
  | "reviewer_invited"
  | "reviewer_reminder"
  | "reviewer_overdue"
  | "reviews_complete"
  | "revision_requested"
  | "revision_reminder"
  | "decision_accept"
  | "decision_reject"
  | "decision_minor_revision"
  | "decision_major_revision"
  | "acceptance_letter"
  | "invoice_issued"
  | "payment_received"
  | "proof_ready"
  | "article_published";

export interface EmailTemplateContext {
  recipientName?: string;
  journalName?: string;
  manuscriptNumber?: string;
  manuscriptTitle?: string;
  articleTitle?: string;
  doi?: string;
  articleUrl?: string;
  actionUrl?: string;
  deadlineAt?: string;
  editorName?: string;
  reviewerName?: string;
  amount?: string;
  currency?: string;
  invoiceNumber?: string;
  decisionReason?: string;
  appUrl?: string;
  [key: string]: string | undefined;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

function wrapHtml(title: string, body: string, ctx: EmailTemplateContext): string {
  const appUrl = ctx.appUrl ?? process.env.NEXT_PUBLIC_APP_URL ?? "";
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head>
<body style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; color:#111; line-height:1.6; max-width:640px; margin:0 auto; padding:24px;">
  <header style="border-bottom:1px solid #e5e7eb; padding-bottom:16px; margin-bottom:24px;">
    <div style="font-weight:700; font-size:18px;">Metademic</div>
    ${ctx.journalName ? `<div style="color:#6b7280; font-size:13px;">${escapeHtml(ctx.journalName)}</div>` : ""}
  </header>
  <main>${body}</main>
  <footer style="margin-top:32px; border-top:1px solid #e5e7eb; padding-top:16px; color:#6b7280; font-size:12px;">
    <p>This is an automated message from Metademic. Please do not reply directly to this email.</p>
    ${appUrl ? `<p><a href="${escapeHtml(appUrl)}" style="color:#111; text-decoration:underline;">${escapeHtml(appUrl)}</a></p>` : ""}
  </footer>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function ctaButton(label: string, href: string): string {
  return `<p style="margin:20px 0;"><a href="${escapeHtml(href)}" style="display:inline-block; background:#111; color:#fff; padding:10px 18px; border-radius:8px; text-decoration:none; font-weight:600;">${escapeHtml(label)}</a></p>`;
}

export const emailTemplates: Record<EmailTemplateName, (ctx: EmailTemplateContext) => RenderedEmail> = {
  submission_received: (ctx) => {
    const subject = `Submission received — ${ctx.manuscriptNumber ?? "manuscript"}`;
    const body = `
      <h1 style="font-size:20px; margin:0 0 8px;">Submission received</h1>
      <p>Dear ${escapeHtml(ctx.recipientName ?? "Author")},</p>
      <p>Your manuscript <strong>${escapeHtml(ctx.manuscriptTitle ?? "")}</strong> (${escapeHtml(ctx.manuscriptNumber ?? "")}) has been received and is now under technical check.</p>
      <p>You can track its progress in your author dashboard.</p>
      ${ctx.actionUrl ? ctaButton("View submission", ctx.actionUrl) : ""}
    `;
    return { subject, html: wrapHtml(subject, body, ctx), text: `${subject}\n\nYour manuscript "${ctx.manuscriptTitle}" (${ctx.manuscriptNumber}) has been received.` };
  },

  editor_assigned: (ctx) => {
    const subject = `You have been assigned as editor — ${ctx.manuscriptNumber ?? ""}`;
    const body = `
      <h1 style="font-size:20px;">Editor assignment</h1>
      <p>Dear ${escapeHtml(ctx.recipientName ?? "Editor")},</p>
      <p>You have been assigned as handling editor for <strong>${escapeHtml(ctx.manuscriptTitle ?? "")}</strong> (${escapeHtml(ctx.manuscriptNumber ?? "")}).</p>
      ${ctx.actionUrl ? ctaButton("Open manuscript", ctx.actionUrl) : ""}
    `;
    return { subject, html: wrapHtml(subject, body, ctx), text: subject };
  },

  reviewer_invited: (ctx) => {
    const subject = `Invitation to review — ${ctx.manuscriptTitle ?? ctx.manuscriptNumber ?? "manuscript"}`;
    const body = `
      <h1 style="font-size:20px;">Invitation to review</h1>
      <p>Dear ${escapeHtml(ctx.recipientName ?? "Reviewer")},</p>
      <p>You are invited to review <strong>${escapeHtml(ctx.manuscriptTitle ?? "")}</strong>${ctx.manuscriptNumber ? ` (${escapeHtml(ctx.manuscriptNumber)})` : ""} for <em>${escapeHtml(ctx.journalName ?? "")}</em>.</p>
      ${ctx.deadlineAt ? `<p><strong>Deadline:</strong> ${escapeHtml(ctx.deadlineAt)}</p>` : ""}
      <p>Please declare any conflict of interest and confirm confidentiality before accepting.</p>
      ${ctx.actionUrl ? ctaButton("Accept / Decline invitation", ctx.actionUrl) : ""}
    `;
    return { subject, html: wrapHtml(subject, body, ctx), text: subject };
  },

  reviewer_reminder: (ctx) => {
    const subject = `Reminder: review due — ${ctx.manuscriptNumber ?? ""}`;
    const body = `
      <h1 style="font-size:20px;">Review reminder</h1>
      <p>Dear ${escapeHtml(ctx.recipientName ?? "Reviewer")},</p>
      <p>This is a friendly reminder that your review for <strong>${escapeHtml(ctx.manuscriptTitle ?? "")}</strong> is pending${ctx.deadlineAt ? ` and due on ${escapeHtml(ctx.deadlineAt)}` : ""}.</p>
      ${ctx.actionUrl ? ctaButton("Continue review", ctx.actionUrl) : ""}
    `;
    return { subject, html: wrapHtml(subject, body, ctx), text: subject };
  },

  reviewer_overdue: (ctx) => {
    const subject = `Overdue review — ${ctx.manuscriptNumber ?? ""}`;
    const body = `
      <h1 style="font-size:20px;">Review overdue</h1>
      <p>Dear ${escapeHtml(ctx.recipientName ?? "Reviewer")},</p>
      <p>Your review for <strong>${escapeHtml(ctx.manuscriptTitle ?? "")}</strong> is now overdue${ctx.deadlineAt ? ` (was due ${escapeHtml(ctx.deadlineAt)})` : ""}. Please submit it as soon as possible or contact the editorial office.</p>
      ${ctx.actionUrl ? ctaButton("Submit review", ctx.actionUrl) : ""}
    `;
    return { subject, html: wrapHtml(subject, body, ctx), text: subject };
  },

  reviews_complete: (ctx) => {
    const subject = `Reviews complete — ${ctx.manuscriptNumber ?? ""}`;
    const body = `
      <h1 style="font-size:20px;">Reviews complete</h1>
      <p>Dear ${escapeHtml(ctx.recipientName ?? "Editor")},</p>
      <p>All required reviews for <strong>${escapeHtml(ctx.manuscriptTitle ?? "")}</strong> (${escapeHtml(ctx.manuscriptNumber ?? "")}) are now complete. A system recommendation is available.</p>
      ${ctx.actionUrl ? ctaButton("View reviews", ctx.actionUrl) : ""}
    `;
    return { subject, html: wrapHtml(subject, body, ctx), text: subject };
  },

  revision_requested: (ctx) => {
    const subject = `Revision requested — ${ctx.manuscriptNumber ?? ""}`;
    const body = `
      <h1 style="font-size:20px;">Revision requested</h1>
      <p>Dear ${escapeHtml(ctx.recipientName ?? "Author")},</p>
      <p>A decision has been made for <strong>${escapeHtml(ctx.manuscriptTitle ?? "")}</strong> (${escapeHtml(ctx.manuscriptNumber ?? "")}). Please revise your manuscript according to the reviewer comments and editor instructions.</p>
      ${ctx.decisionReason ? `<blockquote style="border-left:3px solid #e5e7eb; margin:16px 0; padding:8px 16px; color:#374151;">${escapeHtml(ctx.decisionReason)}</blockquote>` : ""}
      ${ctx.deadlineAt ? `<p><strong>Deadline:</strong> ${escapeHtml(ctx.deadlineAt)}</p>` : ""}
      ${ctx.actionUrl ? ctaButton("Submit revision", ctx.actionUrl) : ""}
    `;
    return { subject, html: wrapHtml(subject, body, ctx), text: subject };
  },

  revision_reminder: (ctx) => {
    const subject = `Reminder: revision due — ${ctx.manuscriptNumber ?? ""}`;
    const body = `
      <h1 style="font-size:20px;">Revision reminder</h1>
      <p>Dear ${escapeHtml(ctx.recipientName ?? "Author")},</p>
      <p>This is a reminder that your revision for <strong>${escapeHtml(ctx.manuscriptTitle ?? "")}</strong> is due${ctx.deadlineAt ? ` on ${escapeHtml(ctx.deadlineAt)}` : ""}.</p>
      ${ctx.actionUrl ? ctaButton("Continue revision", ctx.actionUrl) : ""}
    `;
    return { subject, html: wrapHtml(subject, body, ctx), text: subject };
  },

  decision_accept: (ctx) => {
    const subject = `Decision: Accepted — ${ctx.manuscriptNumber ?? ""}`;
    const body = `
      <h1 style="font-size:20px;">Accepted</h1>
      <p>Dear ${escapeHtml(ctx.recipientName ?? "Author")},</p>
      <p>We are pleased to inform you that <strong>${escapeHtml(ctx.manuscriptTitle ?? "")}</strong> (${escapeHtml(ctx.manuscriptNumber ?? "")}) has been <strong>accepted</strong> for publication.</p>
      ${ctx.decisionReason ? `<p>Editor note: ${escapeHtml(ctx.decisionReason)}</p>` : ""}
      <p>Next steps regarding APC and production will follow.</p>
      ${ctx.actionUrl ? ctaButton("View decision", ctx.actionUrl) : ""}
    `;
    return { subject, html: wrapHtml(subject, body, ctx), text: subject };
  },

  decision_reject: (ctx) => {
    const subject = `Decision: Rejected — ${ctx.manuscriptNumber ?? ""}`;
    const body = `
      <h1 style="font-size:20px;">Decision</h1>
      <p>Dear ${escapeHtml(ctx.recipientName ?? "Author")},</p>
      <p>Thank you for submitting <strong>${escapeHtml(ctx.manuscriptTitle ?? "")}</strong> (${escapeHtml(ctx.manuscriptNumber ?? "")}). After careful consideration, we have decided to <strong>reject</strong> the manuscript.</p>
      ${ctx.decisionReason ? `<blockquote style="border-left:3px solid #e5e7eb; margin:16px 0; padding:8px 16px;">${escapeHtml(ctx.decisionReason)}</blockquote>` : ""}
    `;
    return { subject, html: wrapHtml(subject, body, ctx), text: subject };
  },

  decision_minor_revision: (ctx) => {
    const subject = `Decision: Minor revision — ${ctx.manuscriptNumber ?? ""}`;
    const body = `
      <h1 style="font-size:20px;">Minor revision</h1>
      <p>Dear ${escapeHtml(ctx.recipientName ?? "Author")},</p>
      <p>Your manuscript <strong>${escapeHtml(ctx.manuscriptTitle ?? "")}</strong> requires <strong>minor revisions</strong> before it can be accepted.</p>
      ${ctx.decisionReason ? `<p>${escapeHtml(ctx.decisionReason)}</p>` : ""}
      ${ctx.actionUrl ? ctaButton("Submit revision", ctx.actionUrl) : ""}
    `;
    return { subject, html: wrapHtml(subject, body, ctx), text: subject };
  },

  decision_major_revision: (ctx) => {
    const subject = `Decision: Major revision — ${ctx.manuscriptNumber ?? ""}`;
    const body = `
      <h1 style="font-size:20px;">Major revision</h1>
      <p>Dear ${escapeHtml(ctx.recipientName ?? "Author")},</p>
      <p>Your manuscript <strong>${escapeHtml(ctx.manuscriptTitle ?? "")}</strong> requires <strong>major revisions</strong>.</p>
      ${ctx.decisionReason ? `<p>${escapeHtml(ctx.decisionReason)}</p>` : ""}
      ${ctx.actionUrl ? ctaButton("Submit revision", ctx.actionUrl) : ""}
    `;
    return { subject, html: wrapHtml(subject, body, ctx), text: subject };
  },

  acceptance_letter: (ctx) => {
    const subject = `Acceptance letter — ${ctx.manuscriptNumber ?? ""}`;
    const body = `
      <h1 style="font-size:20px;">Acceptance Letter</h1>
      <p>Dear ${escapeHtml(ctx.recipientName ?? "Author")},</p>
      <p>On behalf of <em>${escapeHtml(ctx.journalName ?? "the journal")}</em>, we are delighted to accept <strong>${escapeHtml(ctx.manuscriptTitle ?? "")}</strong> (${escapeHtml(ctx.manuscriptNumber ?? "")}).</p>
      <p>This letter confirms acceptance for publication. Details regarding APC, production, and DOI assignment will follow.</p>
      <hr style="border:none; border-top:1px solid #e5e7eb; margin:24px 0;">
      <p style="font-size:12px; color:#6b7280;">Journal: ${escapeHtml(ctx.journalName ?? "")} · Manuscript: ${escapeHtml(ctx.manuscriptNumber ?? "")} · Title: ${escapeHtml(ctx.manuscriptTitle ?? "")}</p>
      ${ctx.actionUrl ? ctaButton("View manuscript", ctx.actionUrl) : ""}
    `;
    return { subject, html: wrapHtml(subject, body, ctx), text: subject };
  },

  invoice_issued: (ctx) => {
    const subject = `Invoice ${ctx.invoiceNumber ?? ""} — ${ctx.manuscriptNumber ?? ""}`;
    const body = `
      <h1 style="font-size:20px;">Invoice issued</h1>
      <p>Dear ${escapeHtml(ctx.recipientName ?? "Author")},</p>
      <p>An invoice for <strong>${escapeHtml(ctx.amount ?? "")} ${escapeHtml(ctx.currency ?? "")}</strong> has been issued for <strong>${escapeHtml(ctx.manuscriptTitle ?? "")}</strong> (${escapeHtml(ctx.manuscriptNumber ?? "")}).</p>
      ${ctx.invoiceNumber ? `<p><strong>Invoice:</strong> ${escapeHtml(ctx.invoiceNumber)}</p>` : ""}
      ${ctx.actionUrl ? ctaButton("View invoice", ctx.actionUrl) : ""}
    `;
    return { subject, html: wrapHtml(subject, body, ctx), text: subject };
  },

  payment_received: (ctx) => {
    const subject = `Payment received — ${ctx.invoiceNumber ?? ctx.manuscriptNumber ?? ""}`;
    const body = `
      <h1 style="font-size:20px;">Payment received</h1>
      <p>Dear ${escapeHtml(ctx.recipientName ?? "Author")},</p>
      <p>Thank you — your payment of <strong>${escapeHtml(ctx.amount ?? "")} ${escapeHtml(ctx.currency ?? "")}</strong> has been received${ctx.invoiceNumber ? ` for invoice ${escapeHtml(ctx.invoiceNumber)}` : ""}.</p>
      <p>Your manuscript will now proceed to production.</p>
    `;
    return { subject, html: wrapHtml(subject, body, ctx), text: subject };
  },

  proof_ready: (ctx) => {
    const subject = `Proof ready — ${ctx.manuscriptNumber ?? ""}`;
    const body = `
      <h1 style="font-size:20px;">Proof ready for review</h1>
      <p>Dear ${escapeHtml(ctx.recipientName ?? "Author")},</p>
      <p>The proof for <strong>${escapeHtml(ctx.manuscriptTitle ?? "")}</strong> (${escapeHtml(ctx.manuscriptNumber ?? "")}) is ready for your review. Please check it carefully and approve or request corrections.</p>
      ${ctx.actionUrl ? ctaButton("Review proof", ctx.actionUrl) : ""}
    `;
    return { subject, html: wrapHtml(subject, body, ctx), text: subject };
  },

  article_published: (ctx) => {
    const subject = `Your article is published — ${ctx.articleTitle ?? ""}`;
    const body = `
      <h1 style="font-size:20px;">Published</h1>
      <p>Dear ${escapeHtml(ctx.recipientName ?? "Author")},</p>
      <p>Your article <strong>${escapeHtml(ctx.articleTitle ?? ctx.manuscriptTitle ?? "")}</strong> is now published.</p>
      ${ctx.doi ? `<p><strong>DOI:</strong> <a href="https://doi.org/${escapeHtml(ctx.doi)}">${escapeHtml(ctx.doi)}</a></p>` : ""}
      ${ctx.articleUrl ? ctaButton("View article", ctx.articleUrl) : ""}
    `;
    return { subject, html: wrapHtml(subject, body, ctx), text: subject };
  },
};

/**
 * Render a template by name.
 * Throws if the template does not exist.
 */
export function renderEmailTemplate(
  name: EmailTemplateName,
  ctx: EmailTemplateContext,
): RenderedEmail {
  const fn = emailTemplates[name];
  if (!fn) throw new Error(`Unknown email template: ${name}`);
  return fn(ctx);
}
