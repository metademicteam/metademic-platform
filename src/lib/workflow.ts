import type { ManuscriptStatus } from "@/lib/constants";

/**
 * Manuscript workflow state machine.
 * Implements TASK.md §56 — every allowed transition is enumerated.
 * Any transition not listed is rejected.
 */

// Keep in sync with public.manuscript_status enum in schema.sql
export const MANUSCRIPT_STATUS_TRANSITIONS: Record<ManuscriptStatus, ManuscriptStatus[]> = {
  draft: ["submitted", "withdrawn"],
  submitted: ["technical_check", "withdrawn"],
  technical_check: ["editor_assignment", "returned_to_author", "rejected", "withdrawn"],
  returned_to_author: ["submitted", "withdrawn"],
  editor_assignment: ["editorial_screening", "withdrawn"],
  editorial_screening: ["reviewer_invitation", "rejected", "returned_to_author", "withdrawn"],
  reviewer_invitation: ["under_review", "editorial_screening", "withdrawn"],
  under_review: ["reviews_complete", "withdrawn"],
  reviews_complete: ["decision_pending", "withdrawn"],
  decision_pending: ["accepted", "rejected", "minor_revision", "major_revision", "withdrawn"],
  minor_revision: ["revision_submitted", "withdrawn"],
  major_revision: ["revision_submitted", "withdrawn"],
  revision_submitted: ["re_review", "editorial_screening", "technical_check", "withdrawn"],
  re_review: ["reviews_complete", "decision_pending", "withdrawn"],
  accepted: ["apc_pending", "copyediting", "withdrawn"],
  // Some journals require APC before production; others go straight to copyediting.
  apc_pending: ["copyediting", "withdrawn"],
  copyediting: ["typesetting", "withdrawn"],
  typesetting: ["author_proof", "withdrawn"],
  author_proof: ["production_approval", "typesetting", "withdrawn"],
  production_approval: ["ready_to_publish", "withdrawn"],
  ready_to_publish: ["published", "withdrawn"],
  published: ["retracted"],
  rejected: [],
  withdrawn: [],
  retracted: [],
};

/**
 * Returns true if `to` is a legal successor of `from`.
 */
export function canTransition(from: ManuscriptStatus, to: ManuscriptStatus): boolean {
  const allowed = MANUSCRIPT_STATUS_TRANSITIONS[from];
  if (!allowed) return false;
  return allowed.includes(to);
}

/**
 * Returns all allowed target statuses from `from`.
 */
export function getAllowedTransitions(from: ManuscriptStatus): ManuscriptStatus[] {
  return [...(MANUSCRIPT_STATUS_TRANSITIONS[from] ?? [])];
}

/**
 * Throws a descriptive error if the transition is not allowed.
 * Returns void on success so callers can simply `validateTransition(...)`.
 */
export function validateTransition(from: ManuscriptStatus, to: ManuscriptStatus): void {
  if (from === to) {
    throw new WorkflowError(
      `Invalid transition: status is already "${from}".`,
      from,
      to,
      getAllowedTransitions(from),
    );
  }
  if (!canTransition(from, to)) {
    throw new WorkflowError(
      `Invalid transition from "${from}" to "${to}". Allowed: ${getAllowedTransitions(from).join(", ") || "none"}.`,
      from,
      to,
      getAllowedTransitions(from),
    );
  }
}

export class WorkflowError extends Error {
  constructor(
    message: string,
    public readonly from: ManuscriptStatus,
    public readonly to: ManuscriptStatus,
    public readonly allowed: ManuscriptStatus[],
  ) {
    super(message);
    this.name = "WorkflowError";
  }
}

/**
 * UI helper: is this a terminal status (no outgoing edges)?
 */
export function isTerminalStatus(status: ManuscriptStatus): boolean {
  return getAllowedTransitions(status).length === 0;
}

/**
 * UI helper: is manuscript still in peer-review phase?
 */
export function isReviewPhase(status: ManuscriptStatus): boolean {
  return (
    [
      "reviewer_invitation",
      "under_review",
      "reviews_complete",
      "decision_pending",
      "re_review",
    ] as ManuscriptStatus[]
  ).includes(status);
}

/**
 * UI helper: is manuscript in production phase?
 */
export function isProductionPhase(status: ManuscriptStatus): boolean {
  return (
    [
      "apc_pending",
      "copyediting",
      "typesetting",
      "author_proof",
      "production_approval",
      "ready_to_publish",
    ] as ManuscriptStatus[]
  ).includes(status);
}
