/**
 * TypeScript types mirroring schema.sql enums and tables.
 * Hand-authored (no Supabase codegen dependency) so the project builds without a live DB.
 * Keep in sync with schema.sql if the DB changes — create a migration, then update here.
 */

// ---------------------------------------------------------------------------
// Enums (PostgreSQL → TypeScript)
// ---------------------------------------------------------------------------

export type UserStatus = "active" | "suspended" | "deactivated";
export type JournalStatus = "draft" | "active" | "archived" | "suspended";
export type ManuscriptStatus =
  | "draft"
  | "submitted"
  | "technical_check"
  | "returned_to_author"
  | "editor_assignment"
  | "editorial_screening"
  | "reviewer_invitation"
  | "under_review"
  | "reviews_complete"
  | "decision_pending"
  | "minor_revision"
  | "major_revision"
  | "revision_submitted"
  | "re_review"
  | "accepted"
  | "rejected"
  | "withdrawn"
  | "apc_pending"
  | "copyediting"
  | "typesetting"
  | "author_proof"
  | "production_approval"
  | "ready_to_publish"
  | "published"
  | "retracted";

export type ArticleType =
  | "research_article"
  | "review_article"
  | "systematic_review"
  | "meta_analysis"
  | "short_communication"
  | "case_report"
  | "editorial"
  | "letter"
  | "commentary"
  | "technical_note"
  | "conference_paper"
  | "other";

export type UserRole =
  | "author"
  | "reviewer"
  | "editor"
  | "section_editor"
  | "editor_in_chief"
  | "managing_editor"
  | "copyeditor"
  | "production_editor"
  | "finance_admin"
  | "journal_manager"
  | "journal_admin"
  | "super_admin";

export type ReviewStatus =
  | "invited"
  | "accepted"
  | "declined"
  | "overdue"
  | "reviewing"
  | "completed"
  | "withdrawn"
  | "cancelled";

export type ReviewRecommendation =
  | "accept"
  | "minor_revision"
  | "major_revision"
  | "reject"
  | "no_recommendation";

export type DecisionType =
  | "accept"
  | "minor_revision"
  | "major_revision"
  | "reject"
  | "withdrawn"
  | "desk_reject";

export type FileType =
  | "manuscript"
  | "supplementary"
  | "figure"
  | "table"
  | "cover_letter"
  | "response_to_reviewers"
  | "tracked_changes"
  | "clean_manuscript"
  | "review_attachment"
  | "proof"
  | "production"
  | "published_pdf"
  | "published_html"
  | "published_xml"
  | "other";

export type AnnotationVisibility =
  | "reviewer_editor"
  | "author_reviewer_editor"
  | "editor_only";

export type ApcStatus =
  | "not_required"
  | "calculated"
  | "waiver_requested"
  | "waiver_approved"
  | "invoice_issued"
  | "payment_pending"
  | "paid"
  | "failed"
  | "refunded"
  | "cancelled";

export type InvoiceStatus =
  | "draft"
  | "issued"
  | "pending"
  | "paid"
  | "overdue"
  | "cancelled"
  | "refunded";

export type PaymentStatus =
  | "pending"
  | "processing"
  | "succeeded"
  | "failed"
  | "refunded"
  | "cancelled";

export type ProductionStatus =
  | "not_started"
  | "copyediting"
  | "typesetting"
  | "proof_ready"
  | "author_review"
  | "corrections_requested"
  | "final_approval"
  | "ready"
  | "published";

export type PublicationStatus =
  | "draft"
  | "early_access"
  | "published"
  | "corrected"
  | "retracted";

export type ReviewBlindType = "single_blind" | "double_blind" | "open";

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

export interface Profile {
  id: string;
  email: string | null;
  first_name: string | null;
  middle_name: string | null;
  last_name: string | null;
  display_name: string | null;
  avatar_url: string | null;
  orcid: string | null;
  bio: string | null;
  phone: string | null;
  country_code: string | null;
  status: UserStatus;
  timezone: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Journal {
  id: string;
  organization_id: string | null;
  name: string;
  short_name: string | null;
  slug: string;
  description: string | null;
  issn_print: string | null;
  issn_online: string | null;
  website_url: string | null;
  publisher_name: string | null;
  contact_email: string | null;
  status: JournalStatus;
  default_language: string;
  review_blind_type: ReviewBlindType;
  reviewers_required: number;
  review_deadline_days: number;
  allow_author_suggested_reviewers: boolean;
  allow_author_excluded_reviewers: boolean;
  apc_enabled: boolean;
  default_apc: number;
  currency: string;
  doi_enabled: boolean;
  doi_prefix: string | null;
  doi_suffix_pattern: string | null;
  license_name: string | null;
  license_url: string | null;
  copyright_holder: string | null;
  settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface JournalMember {
  id: string;
  journal_id: string;
  user_id: string;
  role: UserRole;
  is_active: boolean;
  appointed_at: string;
  removed_at: string | null;
  metadata: Record<string, unknown>;
}

export interface Manuscript {
  id: string;
  journal_id: string;
  manuscript_number: string;
  title: string;
  subtitle: string | null;
  abstract: string | null;
  article_type: ArticleType;
  keywords: string[];
  subject_areas: string[];
  language_code: string;
  status: ManuscriptStatus;
  current_version: number;
  current_review_round: number;
  submitted_by: string | null;
  corresponding_author_id: string | null;
  assigned_editor_id: string | null;
  technical_checked_at: string | null;
  editorial_screened_at: string | null;
  submitted_at: string | null;
  accepted_at: string | null;
  rejected_at: string | null;
  withdrawn_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface ManuscriptAuthor {
  id: string;
  manuscript_id: string;
  user_id: string | null;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  email: string | null;
  orcid: string | null;
  institution_id: string | null;
  institution_name_snapshot: string | null;
  department_snapshot: string | null;
  author_order: number;
  is_corresponding: boolean;
  contribution_statement: string | null;
  created_at: string;
}

export interface ManuscriptVersion {
  id: string;
  manuscript_id: string;
  version_number: number;
  revision_round: number;
  version_label: string | null;
  change_summary: string | null;
  submitted_by: string | null;
  submitted_at: string | null;
  created_at: string;
}

export interface ManuscriptFile {
  id: string;
  manuscript_id: string;
  version_id: string | null;
  uploaded_by: string | null;
  file_type: FileType;
  original_filename: string;
  storage_bucket: string;
  storage_path: string;
  mime_type: string | null;
  file_size: number | null;
  checksum: string | null;
  page_count: number | null;
  is_public: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface SubmissionDeclaration {
  id: string;
  manuscript_id: string;
  conflict_of_interest: string | null;
  funding_statement: string | null;
  ethics_statement: string | null;
  data_availability_statement: string | null;
  author_contributions: string | null;
  acknowledgements: string | null;
  originality_confirmed: boolean;
  ethics_confirmed: boolean;
  authorship_confirmed: boolean;
  copyright_confirmed: boolean;
  created_at: string;
  updated_at: string;
}

export interface ReviewRound {
  id: string;
  manuscript_id: string;
  round_number: number;
  required_reviewers: number;
  started_at: string;
  completed_at: string | null;
  notes: string | null;
}

export interface ReviewAssignment {
  id: string;
  review_round_id: string;
  reviewer_id: string;
  invitation_id: string | null;
  status: ReviewStatus;
  invited_at: string;
  accepted_at: string | null;
  started_at: string | null;
  deadline_at: string | null;
  completed_at: string | null;
  declined_at: string | null;
  withdrawn_at: string | null;
  is_anonymous: boolean;
  conflict_declared: boolean;
  conflict_reason: string | null;
  reminder_count: number;
  metadata: Record<string, unknown>;
}

export interface ReviewReport {
  id: string;
  review_assignment_id: string;
  originality_score: number | null;
  methodology_score: number | null;
  literature_score: number | null;
  results_score: number | null;
  discussion_score: number | null;
  writing_score: number | null;
  significance_score: number | null;
  comments_to_author: string | null;
  confidential_comments_to_editor: string | null;
  recommendation: ReviewRecommendation;
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface EditorialDecision {
  id: string;
  manuscript_id: string;
  review_round_id: string | null;
  editor_id: string;
  decision: DecisionType;
  system_recommendation: ReviewRecommendation | null;
  accept_votes: number;
  minor_revision_votes: number;
  major_revision_votes: number;
  reject_votes: number;
  editor_reason: string | null;
  override_system_recommendation: boolean;
  created_at: string;
}

export interface Article {
  id: string;
  manuscript_id: string;
  journal_id: string;
  issue_id: string | null;
  article_number: string;
  slug: string;
  title: string;
  abstract: string | null;
  article_type: ArticleType;
  publication_status: PublicationStatus;
  received_at: string | null;
  revised_at: string | null;
  accepted_at: string | null;
  published_at: string | null;
  first_page: number | null;
  last_page: number | null;
  article_number_label: string | null;
  license_name: string | null;
  license_url: string | null;
  copyright_holder: string | null;
  citation_text: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface DoiRecord {
  id: string;
  article_id: string;
  doi: string;
  doi_url: string;
  prefix: string;
  suffix: string;
  registration_agency: string | null;
  registration_status: "pending" | "queued" | "registered" | "failed" | "updated";
  registered_at: string | null;
  last_deposit_at: string | null;
  last_error: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Apc {
  id: string;
  manuscript_id: string;
  base_amount: number;
  discount_amount: number;
  waiver_amount: number;
  tax_amount: number;
  total_amount: number;
  currency: string;
  status: ApcStatus;
  calculated_at: string | null;
  paid_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Invoice {
  id: string;
  apc_id: string;
  invoice_number: string;
  amount: number;
  currency: string;
  status: InvoiceStatus;
  issued_at: string | null;
  due_at: string | null;
  paid_at: string | null;
  billing_name: string | null;
  billing_email: string | null;
  billing_address: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  journal_id: string | null;
  manuscript_id: string | null;
  type: string;
  title: string;
  message: string;
  action_url: string | null;
  is_read: boolean;
  read_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface WorkflowEvent {
  id: string;
  manuscript_id: string | null;
  actor_id: string | null;
  from_status: ManuscriptStatus | null;
  to_status: ManuscriptStatus | null;
  event_type: string;
  description: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface AuditLog {
  id: string;
  actor_id: string | null;
  journal_id: string | null;
  manuscript_id: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Database helper type (for supabase-js generics)
// ---------------------------------------------------------------------------

export interface Database {
  public: {
    Tables: {
      profiles: { Row: Profile; Insert: Partial<Profile>; Update: Partial<Profile> };
      journals: { Row: Journal; Insert: Partial<Journal>; Update: Partial<Journal> };
      journal_members: { Row: JournalMember; Insert: Partial<JournalMember>; Update: Partial<JournalMember> };
      manuscripts: { Row: Manuscript; Insert: Partial<Manuscript>; Update: Partial<Manuscript> };
      manuscript_authors: { Row: ManuscriptAuthor; Insert: Partial<ManuscriptAuthor>; Update: Partial<ManuscriptAuthor> };
      manuscript_versions: { Row: ManuscriptVersion; Insert: Partial<ManuscriptVersion>; Update: Partial<ManuscriptVersion> };
      manuscript_files: { Row: ManuscriptFile; Insert: Partial<ManuscriptFile>; Update: Partial<ManuscriptFile> };
      review_rounds: { Row: ReviewRound; Insert: Partial<ReviewRound>; Update: Partial<ReviewRound> };
      review_assignments: { Row: ReviewAssignment; Insert: Partial<ReviewAssignment>; Update: Partial<ReviewAssignment> };
      review_reports: { Row: ReviewReport; Insert: Partial<ReviewReport>; Update: Partial<ReviewReport> };
      editorial_decisions: { Row: EditorialDecision; Insert: Partial<EditorialDecision>; Update: Partial<EditorialDecision> };
      articles: { Row: Article; Insert: Partial<Article>; Update: Partial<Article> };
      doi_records: { Row: DoiRecord; Insert: Partial<DoiRecord>; Update: Partial<DoiRecord> };
      apcs: { Row: Apc; Insert: Partial<Apc>; Update: Partial<Apc> };
      invoices: { Row: Invoice; Insert: Partial<Invoice>; Update: Partial<Invoice> };
      notifications: { Row: Notification; Insert: Partial<Notification>; Update: Partial<Notification> };
      workflow_events: { Row: WorkflowEvent; Insert: Partial<WorkflowEvent>; Update: Partial<WorkflowEvent> };
      audit_logs: { Row: AuditLog; Insert: Partial<AuditLog>; Update: Partial<AuditLog> };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      manuscript_status: ManuscriptStatus;
      user_role: UserRole;
      article_type: ArticleType;
      review_status: ReviewStatus;
      review_recommendation: ReviewRecommendation;
      decision_type: DecisionType;
      file_type: FileType;
      apc_status: ApcStatus;
      invoice_status: InvoiceStatus;
      payment_status: PaymentStatus;
      production_status: ProductionStatus;
      publication_status: PublicationStatus;
    };
  };
}
