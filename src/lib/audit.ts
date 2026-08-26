import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Central audit logging helper — TASK §39.
 * Every important API writes audit_logs; never allow normal users to edit them (enforced via RLS).
 * Use `createAdminClient` for server contexts where RLS might block the insert, or pass the
 * request-scoped client when the user is authenticated and RLS allows insertion.
 */

export interface AuditLogParams {
  actorId: string | null;
  journalId?: string | null;
  manuscriptId?: string | null;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  oldData?: Record<string, unknown> | null;
  newData?: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown>;
}

export async function writeAuditLog(
  supabase: SupabaseClient,
  params: AuditLogParams,
): Promise<void> {
  const { error } = await supabase.from("audit_logs").insert({
    actor_id: params.actorId,
    journal_id: params.journalId ?? null,
    manuscript_id: params.manuscriptId ?? null,
    action: params.action,
    entity_type: params.entityType ?? null,
    entity_id: params.entityId ?? null,
    old_data: params.oldData ?? null,
    new_data: params.newData ?? null,
    // ip_address is handled at DB level if provided; some callers pass via metadata
    metadata: {
      ...(params.metadata ?? {}),
      ...(params.ipAddress ? { ip_address: params.ipAddress } : {}),
      ...(params.userAgent ? { user_agent: params.userAgent } : {}),
    } as never,
  } as never);

  if (error) {
    // Audit failure must be visible server-side but not break main transaction unless caller chooses.
    console.error("[audit] insert failed:", error.message, { action: params.action });
  }
}

/**
 * Extract IP + UA from a NextRequest for audit context.
 */
export function getRequestMeta(req: Request): { ip: string | null; ua: string | null } {
  try {
    // NextRequest has headers + ip via x-forwarded-for
    const headers = (req as unknown as { headers: { get: (k: string) => string | null } }).headers;
    const ip =
      headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      headers.get("x-real-ip") ??
      null;
    const ua = headers.get("user-agent") ?? null;
    return { ip, ua };
  } catch {
    return { ip: null, ua: null };
  }
}

/**
 * Convenience wrappers for domain events so callers don't repeat action strings.
 */
export const AuditActions = {
  MANUSCRIPT_CREATED: "manuscript.created",
  MANUSCRIPT_SUBMITTED: "manuscript.submitted",
  MANUSCRIPT_UPDATED: "manuscript.updated",
  EDITOR_ASSIGNED: "editor.assigned",
  EDITOR_UNASSIGNED: "editor.unassigned",
  REVIEWER_INVITED: "reviewer.invited",
  REVIEWER_ACCEPTED: "reviewer.accepted",
  REVIEWER_DECLINED: "reviewer.declined",
  REVIEW_SUBMITTED: "review.submitted",
  DECISION_MADE: "editorial_decision.created",
  DECISION_OVERRIDDEN: "editorial_decision.overridden",
  REVISION_REQUESTED: "revision.requested",
  REVISION_SUBMITTED: "revision.submitted",
  AUTHOR_RESPONSE: "author.response",
  MANUSCRIPT_ACCEPTED: "manuscript.accepted",
  APC_CALCULATED: "apc.calculated",
  APC_WAIVER_REQUESTED: "apc.waiver_requested",
  INVOICE_ISSUED: "invoice.issued",
  PAYMENT_RECEIVED: "payment.received",
  PRODUCTION_STARTED: "production.started",
  ARTICLE_PUBLISHED: "article.published",
  DOI_REGISTERED: "doi.registered",
  DOI_QUEUED: "doi.queued",
  ARTICLE_RETRACTED: "article.retracted",
  JOB_CREATED: "system_job.created",
  JOB_RETRIED: "system_job.retried",
} as const;
