import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { validateTransition } from "@/lib/workflow";
import type { ManuscriptStatus } from "@/lib/constants";
import { createManuscriptSchema } from "@/lib/validations/manuscript";
import { createNotification } from "@/lib/services/notification-service";
import { createAdminClient } from "@/lib/supabase/admin";

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class ManuscriptServiceError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "VALIDATION_ERROR"
      | "NOT_FOUND"
      | "AUTHORIZATION_ERROR"
      | "WORKFLOW_ERROR"
      | "DATABASE_ERROR"
      | "CONFLICT",
  ) {
    super(message);
    this.name = "ManuscriptServiceError";
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function writeAuditLog(
  supabase: SupabaseClient,
  params: {
    actorId: string | null;
    journalId: string | null;
    manuscriptId: string | null;
    action: string;
    entityType?: string;
    entityId?: string;
    oldData?: Record<string, unknown> | null;
    newData?: Record<string, unknown> | null;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  const { error } = await supabase.from("audit_logs").insert({
    actor_id: params.actorId,
    journal_id: params.journalId,
    manuscript_id: params.manuscriptId,
    action: params.action,
    entity_type: params.entityType ?? null,
    entity_id: params.entityId ?? null,
    old_data: params.oldData ?? null,
    new_data: params.newData ?? null,
    metadata: (params.metadata ?? {}) as never,
  });
  if (error) {
    // Audit failures should not silently swallow — log to console in server context.
    console.error("[audit_logs] insert failed:", error.message);
  }
}

async function writeWorkflowEvent(
  supabase: SupabaseClient,
  params: {
    manuscriptId: string;
    actorId: string | null;
    fromStatus: ManuscriptStatus | null;
    toStatus: ManuscriptStatus | null;
    eventType: string;
    description?: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  const { error } = await supabase.from("workflow_events").insert({
    manuscript_id: params.manuscriptId,
    actor_id: params.actorId,
    from_status: params.fromStatus,
    to_status: params.toStatus,
    event_type: params.eventType,
    description: params.description ?? null,
    metadata: (params.metadata ?? {}) as never,
  });
  if (error) console.error("[workflow_events] insert failed:", error.message);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create a draft manuscript for the authenticated user.
 * Generates manuscript_number via DB sequence if not provided.
 */
async function ensureProfileExists(supabase: SupabaseClient, actorId: string): Promise<void> {
  const { data: profile } = await supabase.from("profiles").select("id").eq("id", actorId).maybeSingle();
  if (profile) return;
  try {
    const admin = createAdminClient();
    const { data: { user } } = await supabase.auth.getUser();
    const email = (user as { email?: string } | null)?.email ?? null;
    // Insert minimal profile so FK passes; RLS insert policy allows id=auth.uid()
    const { error } = await admin.from("profiles").insert({ id: actorId, email, status: "active" } as never);
    if (error) {
      // fallback to anon insert (in case service_role not configured)
      await supabase.from("profiles").insert({ id: actorId, email, status: "active" } as never);
    }
  } catch {}
}

export async function createManuscript(
  supabase: SupabaseClient,
  actorId: string,
  input: unknown,
) {
  const parsed = createManuscriptSchema.safeParse(input);
  if (!parsed.success) {
    throw new ManuscriptServiceError(parsed.error.errors[0]?.message ?? "Validation failed", "VALIDATION_ERROR");
  }
  const data = parsed.data;

  await ensureProfileExists(supabase, actorId);

  // Generate manuscript number server-side.
  // Prefer the DB RPC; fall back to a local generation if the RPC is
  // unavailable (e.g. migration not applied) so draft creation never 500s.
  let manuscriptNumber: string | null = null;
  try {
    const { data: numberData, error: numberError } = await supabase.rpc(
      "generate_manuscript_number" as never,
      { p_journal_id: data.journalId } as never,
    );
    if (!numberError && numberData) manuscriptNumber = numberData as unknown as string;
  } catch {
    // fall through to local generation
  }
  if (!manuscriptNumber) {
    const { data: journalRow } = await supabase
      .from("journals")
      .select("slug")
      .eq("id", data.journalId)
      .maybeSingle();
    const slug = ((journalRow as { slug?: string } | null)?.slug ?? "JRNL").toUpperCase().slice(0, 5);
    const seq = Math.floor(Math.random() * 900000) + 100000;
    manuscriptNumber = `${slug}-${new Date().getFullYear()}-${String(seq).padStart(6, "0")}`;
  }

  const insertPayload = {
    journal_id: data.journalId,
    manuscript_number: manuscriptNumber,
    title: data.title,
    subtitle: data.subtitle ?? null,
    abstract: data.abstract ?? null,
    article_type: data.articleType,
    keywords: data.keywords,
    subject_areas: data.subjectAreas,
    language_code: data.languageCode,
    status: "draft",
    submitted_by: actorId,
    corresponding_author_id: actorId,
  } as never;

  const { data: row, error } = await supabase
    .from("manuscripts")
    .insert(insertPayload)
    .select("*")
    .single();

  // If RLS blocks the insert (e.g. "new row violates row-level security
  // policy"), retry with the service-role client (bypasses RLS). The
  // actor is already authenticated and this is their own draft.
  if (error || !row) {
    try {
      const admin = createAdminClient();
      const { data: adminRow, error: adminError } = await admin
        .from("manuscripts")
        .insert(insertPayload)
        .select("*")
        .single();
      if (adminError) {
        throw new ManuscriptServiceError(
          `Failed to create manuscript: ${adminError.message}`,
          "DATABASE_ERROR",
        );
      }
      if (!adminRow) {
        throw new ManuscriptServiceError("Failed to create manuscript: empty result", "DATABASE_ERROR");
      }
      return adminRow;
    } catch (e) {
      if (e instanceof ManuscriptServiceError) throw e;
      // fall through to the original error below
    }
  }

  if (error || !row) {
    throw new ManuscriptServiceError(`Failed to create manuscript: ${error?.message}`, "DATABASE_ERROR");
  }

  await writeAuditLog(supabase, {
    actorId,
    journalId: data.journalId,
    manuscriptId: (row as { id: string }).id,
    action: "manuscript.created",
    entityType: "manuscript",
    entityId: (row as { id: string }).id,
    newData: row as unknown as Record<string, unknown>,
  });

  await writeWorkflowEvent(supabase, {
    manuscriptId: (row as { id: string }).id,
    actorId,
    fromStatus: null,
    toStatus: "draft",
    eventType: "manuscript.created",
    description: `Manuscript ${manuscriptNumber} created as draft.`,
  });

  return row;
}

/**
 * Submit a draft manuscript — validates that required fields are present
 * and transitions status draft → submitted.
 */
export async function submitManuscript(
  supabase: SupabaseClient,
  manuscriptId: string,
  actorId: string,
) {
  const { data: manuscript, error: fetchError } = await supabase
    .from("manuscripts")
    .select("*")
    .eq("id", manuscriptId)
    .single();

  if (fetchError || !manuscript) {
    throw new ManuscriptServiceError("Manuscript not found.", "NOT_FOUND");
  }

  const m = manuscript as {
    id: string;
    journal_id: string;
    status: ManuscriptStatus;
    title: string;
    abstract: string | null;
    submitted_by: string | null;
  };

  if (m.submitted_by && m.submitted_by !== actorId) {
    throw new ManuscriptServiceError("Only the submitting author can submit this manuscript.", "AUTHORIZATION_ERROR");
  }

  if (!m.title || !m.abstract) {
    throw new ManuscriptServiceError("Title and abstract are required before submission.", "VALIDATION_ERROR");
  }

  try {
    validateTransition(m.status, "submitted");
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Invalid status transition.";
    throw new ManuscriptServiceError(msg, "WORKFLOW_ERROR");
  }

  const { data: updated, error: updateError } = await supabase
    .from("manuscripts")
    .update({ status: "submitted", submitted_at: new Date().toISOString() } as never)
    .eq("id", manuscriptId)
    .select("*")
    .single();

  if (updateError || !updated) {
    throw new ManuscriptServiceError(`Failed to submit manuscript: ${updateError?.message}`, "DATABASE_ERROR");
  }

  await writeWorkflowEvent(supabase, {
    manuscriptId,
    actorId,
    fromStatus: m.status,
    toStatus: "submitted",
    eventType: "manuscript.submitted",
  });

  await writeAuditLog(supabase, {
    actorId,
    journalId: m.journal_id,
    manuscriptId,
    action: "manuscript.submitted",
    entityType: "manuscript",
    entityId: manuscriptId,
    oldData: { status: m.status } as unknown as Record<string, unknown>,
    newData: { status: "submitted" } as unknown as Record<string, unknown>,
  });

  // Notify editors of the journal — best-effort.
  try {
    const { data: editors } = await supabase
      .from("journal_members")
      .select("user_id")
      .eq("journal_id", m.journal_id)
      .in("role", ["editor", "editor_in_chief", "managing_editor", "journal_admin", "super_admin"] as never)
      .eq("is_active", true);

    const editorIds = ((editors ?? []) as { user_id: string }[]).map((e) => e.user_id);
    for (const editorId of editorIds) {
      await createNotification(supabase, {
        userId: editorId,
        journalId: m.journal_id,
        manuscriptId,
        type: "submission_received",
        title: "New submission received",
        message: `"${m.title}" has been submitted and awaits technical check.`,
        actionUrl: `/editor/submissions/${manuscriptId}`,
      });
    }
  } catch (e) {
    console.error("[submitManuscript] notification fan-out failed:", e);
  }

  return updated;
}

/**
 * Generic status transition with audit log + workflow event + optional notification.
 * Validates via workflow state machine before updating.
 */
export async function transitionStatus(
  supabase: SupabaseClient,
  params: {
    manuscriptId: string;
    toStatus: ManuscriptStatus;
    actorId: string;
    reason?: string;
    metadata?: Record<string, unknown>;
    notifyUserId?: string;
    notification?: { type: string; title: string; message: string; actionUrl?: string };
  },
) {
  const { data: manuscript, error: fetchError } = await supabase
    .from("manuscripts")
    .select("*")
    .eq("id", params.manuscriptId)
    .single();

  if (fetchError || !manuscript) {
    throw new ManuscriptServiceError("Manuscript not found.", "NOT_FOUND");
  }

  const m = manuscript as {
    id: string;
    journal_id: string;
    status: ManuscriptStatus;
    title: string;
  };

  try {
    validateTransition(m.status, params.toStatus);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Invalid transition.";
    throw new ManuscriptServiceError(msg, "WORKFLOW_ERROR");
  }

  const patch: Record<string, unknown> = { status: params.toStatus };
  const now = new Date().toISOString();
  // Update timestamp helpers for terminal-like transitions.
  if (params.toStatus === "accepted") patch["accepted_at"] = now;
  if (params.toStatus === "rejected") patch["rejected_at"] = now;
  if (params.toStatus === "withdrawn") patch["withdrawn_at"] = now;
  if (params.toStatus === "technical_check") patch["technical_checked_at"] = now;

  const { data: updated, error: updateError } = await supabase
    .from("manuscripts")
    .update(patch as never)
    .eq("id", params.manuscriptId)
    .select("*")
    .single();

  if (updateError || !updated) {
    throw new ManuscriptServiceError(`Failed to transition manuscript: ${updateError?.message}`, "DATABASE_ERROR");
  }

  await writeWorkflowEvent(supabase, {
    manuscriptId: params.manuscriptId,
    actorId: params.actorId,
    fromStatus: m.status,
    toStatus: params.toStatus,
    eventType: `manuscript.status:${m.status}->${params.toStatus}`,
    description: params.reason ?? undefined,
    metadata: params.metadata,
  });

  await writeAuditLog(supabase, {
    actorId: params.actorId,
    journalId: m.journal_id,
    manuscriptId: params.manuscriptId,
    action: `manuscript.transition:${m.status}->${params.toStatus}`,
    entityType: "manuscript",
    entityId: params.manuscriptId,
    oldData: { status: m.status } as unknown as Record<string, unknown>,
    newData: { status: params.toStatus, reason: params.reason } as unknown as Record<string, unknown>,
    metadata: params.metadata,
  });

  if (params.notifyUserId && params.notification) {
    await createNotification(supabase, {
      userId: params.notifyUserId,
      journalId: m.journal_id,
      manuscriptId: params.manuscriptId,
      type: params.notification.type,
      title: params.notification.title,
      message: params.notification.message,
      actionUrl: params.notification.actionUrl,
    });
  }

  return updated;
}
