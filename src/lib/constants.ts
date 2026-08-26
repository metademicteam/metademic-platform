/**
 * Central constants — single source of truth for enums, labels, and config defaults.
 * Mirrors PostgreSQL enums in schema.sql where applicable.
 */

// ---------------------------------------------------------------------------
// Article Types
// ---------------------------------------------------------------------------

export const ARTICLE_TYPES = [
  "research_article",
  "review_article",
  "systematic_review",
  "meta_analysis",
  "short_communication",
  "case_report",
  "editorial",
  "letter",
  "commentary",
  "technical_note",
  "conference_paper",
  "other",
] as const;

export type ArticleType = (typeof ARTICLE_TYPES)[number];

export const ARTICLE_TYPE_LABELS: Record<ArticleType, string> = {
  research_article: "Research Article",
  review_article: "Review Article",
  systematic_review: "Systematic Review",
  meta_analysis: "Meta-Analysis",
  short_communication: "Short Communication",
  case_report: "Case Report",
  editorial: "Editorial",
  letter: "Letter to the Editor",
  commentary: "Commentary",
  technical_note: "Technical Note",
  conference_paper: "Conference Paper",
  other: "Other",
};

// ---------------------------------------------------------------------------
// Manuscript Statuses
// ---------------------------------------------------------------------------

export const MANUSCRIPT_STATUSES = [
  "draft",
  "submitted",
  "technical_check",
  "returned_to_author",
  "editor_assignment",
  "editorial_screening",
  "reviewer_invitation",
  "under_review",
  "reviews_complete",
  "decision_pending",
  "minor_revision",
  "major_revision",
  "revision_submitted",
  "re_review",
  "accepted",
  "rejected",
  "withdrawn",
  "apc_pending",
  "copyediting",
  "typesetting",
  "author_proof",
  "production_approval",
  "ready_to_publish",
  "published",
  "retracted",
] as const;

export type ManuscriptStatus = (typeof MANUSCRIPT_STATUSES)[number];

export const MANUSCRIPT_STATUS_LABELS: Record<ManuscriptStatus, string> = {
  draft: "Draft",
  submitted: "Submitted",
  technical_check: "Technical Check",
  returned_to_author: "Returned to Author",
  editor_assignment: "Editor Assignment",
  editorial_screening: "Editorial Screening",
  reviewer_invitation: "Reviewer Invitation",
  under_review: "Under Review",
  reviews_complete: "Reviews Complete",
  decision_pending: "Decision Pending",
  minor_revision: "Minor Revision",
  major_revision: "Major Revision",
  revision_submitted: "Revision Submitted",
  re_review: "Re-Review",
  accepted: "Accepted",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
  apc_pending: "APC Pending",
  copyediting: "Copyediting",
  typesetting: "Typesetting",
  author_proof: "Author Proof",
  production_approval: "Production Approval",
  ready_to_publish: "Ready to Publish",
  published: "Published",
  retracted: "Retracted",
};

export const MANUSCRIPT_STATUS_COLORS: Record<ManuscriptStatus, string> = {
  draft: "secondary",
  submitted: "default",
  technical_check: "secondary",
  returned_to_author: "destructive",
  editor_assignment: "secondary",
  editorial_screening: "secondary",
  reviewer_invitation: "secondary",
  under_review: "default",
  reviews_complete: "default",
  decision_pending: "secondary",
  minor_revision: "secondary",
  major_revision: "secondary",
  revision_submitted: "default",
  re_review: "default",
  accepted: "default",
  rejected: "destructive",
  withdrawn: "outline",
  apc_pending: "secondary",
  copyediting: "secondary",
  typesetting: "secondary",
  author_proof: "secondary",
  production_approval: "secondary",
  ready_to_publish: "default",
  published: "default",
  retracted: "destructive",
};

// ---------------------------------------------------------------------------
// Review
// ---------------------------------------------------------------------------

export const REVIEW_STATUSES = [
  "invited",
  "accepted",
  "declined",
  "overdue",
  "reviewing",
  "completed",
  "withdrawn",
  "cancelled",
] as const;

export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export const REVIEW_RECOMMENDATIONS = [
  "accept",
  "minor_revision",
  "major_revision",
  "reject",
  "no_recommendation",
] as const;

export type ReviewRecommendation = (typeof REVIEW_RECOMMENDATIONS)[number];

export const REVIEW_RECOMMENDATION_LABELS: Record<ReviewRecommendation, string> = {
  accept: "Accept",
  minor_revision: "Minor Revision",
  major_revision: "Major Revision",
  reject: "Reject",
  no_recommendation: "No Recommendation",
};

export const DECISION_TYPES = [
  "accept",
  "minor_revision",
  "major_revision",
  "reject",
  "withdrawn",
  "desk_reject",
] as const;

export type DecisionType = (typeof DECISION_TYPES)[number];

export const DECISION_LABELS: Record<DecisionType, string> = {
  accept: "Accept",
  minor_revision: "Minor Revision",
  major_revision: "Major Revision",
  reject: "Reject",
  withdrawn: "Withdrawn",
  desk_reject: "Desk Reject",
};

// ---------------------------------------------------------------------------
// File Types
// ---------------------------------------------------------------------------

export const FILE_TYPES = [
  "manuscript",
  "supplementary",
  "figure",
  "table",
  "cover_letter",
  "response_to_reviewers",
  "tracked_changes",
  "clean_manuscript",
  "review_attachment",
  "proof",
  "production",
  "published_pdf",
  "published_html",
  "published_xml",
  "other",
] as const;

export type FileType = (typeof FILE_TYPES)[number];

// ---------------------------------------------------------------------------
// APC / Payment
// ---------------------------------------------------------------------------

export const APC_STATUSES = [
  "not_required",
  "calculated",
  "waiver_requested",
  "waiver_approved",
  "invoice_issued",
  "payment_pending",
  "paid",
  "failed",
  "refunded",
  "cancelled",
] as const;

export type ApcStatus = (typeof APC_STATUSES)[number];

export const INVOICE_STATUSES = [
  "draft",
  "issued",
  "pending",
  "paid",
  "overdue",
  "cancelled",
  "refunded",
] as const;

export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const PAYMENT_STATUSES = [
  "pending",
  "processing",
  "succeeded",
  "failed",
  "refunded",
  "cancelled",
] as const;

export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PRODUCTION_STATUSES = [
  "not_started",
  "copyediting",
  "typesetting",
  "proof_ready",
  "author_review",
  "corrections_requested",
  "final_approval",
  "ready",
  "published",
] as const;

export type ProductionStatus = (typeof PRODUCTION_STATUSES)[number];

export const PUBLICATION_STATUSES = [
  "draft",
  "early_access",
  "published",
  "corrected",
  "retracted",
] as const;

export type PublicationStatus = (typeof PUBLICATION_STATUSES)[number];

export const JOURNAL_STATUSES = ["draft", "active", "archived", "suspended"] as const;
export type JournalStatus = (typeof JOURNAL_STATUSES)[number];

export const USER_STATUSES = ["active", "suspended", "deactivated"] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const REVIEW_BLIND_TYPES = ["single_blind", "double_blind", "open"] as const;
export type ReviewBlindType = (typeof REVIEW_BLIND_TYPES)[number];

// ---------------------------------------------------------------------------
// Pagination / Limits
// ---------------------------------------------------------------------------

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export const MAX_MANUSCRIPT_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB
export const MAX_SUPPLEMENTARY_FILE_SIZE_BYTES = 100 * 1024 * 1024;
export const ALLOWED_MANUSCRIPT_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "text/plain",
];

export const ALLOWED_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/tiff",
  "image/webp",
];

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

export const APP_NAME = "Metademic";
export const APP_TAGLINE = "Scholarly Publishing Platform";

export const ORCID_REGEX = /^(\d{4}-){3}\d{3}[\dX]$/;
