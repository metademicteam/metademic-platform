-- ============================================================
-- SCHOLARLY JOURNAL MANAGEMENT PLATFORM
-- Supabase PostgreSQL
-- ============================================================

begin;

create extension if not exists pgcrypto;
create extension if not exists citext;

-- ============================================================
-- ENUMS
-- ============================================================

do $$ begin
    create type public.user_status as enum (
        'active',
        'suspended',
        'deactivated'
    );
exception when duplicate_object then null;
end $$;

do $$ begin
    create type public.journal_status as enum (
        'draft',
        'active',
        'archived',
        'suspended'
    );
exception when duplicate_object then null;
end $$;

do $$ begin
    create type public.manuscript_status as enum (
        'draft',
        'submitted',
        'technical_check',
        'returned_to_author',
        'editor_assignment',
        'editorial_screening',
        'reviewer_invitation',
        'under_review',
        'reviews_complete',
        'decision_pending',
        'minor_revision',
        'major_revision',
        'revision_submitted',
        're_review',
        'accepted',
        'rejected',
        'withdrawn',
        'apc_pending',
        'copyediting',
        'typesetting',
        'author_proof',
        'production_approval',
        'ready_to_publish',
        'published',
        'retracted'
    );
exception when duplicate_object then null;
end $$;

do $$ begin
    create type public.article_type as enum (
        'research_article',
        'review_article',
        'systematic_review',
        'meta_analysis',
        'short_communication',
        'case_report',
        'editorial',
        'letter',
        'commentary',
        'technical_note',
        'conference_paper',
        'other'
    );
exception when duplicate_object then null;
end $$;

do $$ begin
    create type public.user_role as enum (
        'author',
        'reviewer',
        'editor',
        'section_editor',
        'editor_in_chief',
        'managing_editor',
        'copyeditor',
        'production_editor',
        'finance_admin',
        'journal_manager',
        'journal_admin',
        'super_admin'
    );
exception when duplicate_object then null;
end $$;

do $$ begin
    create type public.review_status as enum (
        'invited',
        'accepted',
        'declined',
        'overdue',
        'reviewing',
        'completed',
        'withdrawn',
        'cancelled'
    );
exception when duplicate_object then null;
end $$;

do $$ begin
    create type public.review_recommendation as enum (
        'accept',
        'minor_revision',
        'major_revision',
        'reject',
        'no_recommendation'
    );
exception when duplicate_object then null;
end $$;

do $$ begin
    create type public.decision_type as enum (
        'accept',
        'minor_revision',
        'major_revision',
        'reject',
        'withdrawn',
        'desk_reject'
    );
exception when duplicate_object then null;
end $$;

do $$ begin
    create type public.file_type as enum (
        'manuscript',
        'supplementary',
        'figure',
        'table',
        'cover_letter',
        'response_to_reviewers',
        'tracked_changes',
        'clean_manuscript',
        'review_attachment',
        'proof',
        'production',
        'published_pdf',
        'published_html',
        'published_xml',
        'other'
    );
exception when duplicate_object then null;
end $$;

do $$ begin
    create type public.annotation_visibility as enum (
        'reviewer_editor',
        'author_reviewer_editor',
        'editor_only'
    );
exception when duplicate_object then null;
end $$;

do $$ begin
    create type public.apc_status as enum (
        'not_required',
        'calculated',
        'waiver_requested',
        'waiver_approved',
        'invoice_issued',
        'payment_pending',
        'paid',
        'failed',
        'refunded',
        'cancelled'
    );
exception when duplicate_object then null;
end $$;

do $$ begin
    create type public.invoice_status as enum (
        'draft',
        'issued',
        'pending',
        'paid',
        'overdue',
        'cancelled',
        'refunded'
    );
exception when duplicate_object then null;
end $$;

do $$ begin
    create type public.payment_status as enum (
        'pending',
        'processing',
        'succeeded',
        'failed',
        'refunded',
        'cancelled'
    );
exception when duplicate_object then null;
end $$;

do $$ begin
    create type public.production_status as enum (
        'not_started',
        'copyediting',
        'typesetting',
        'proof_ready',
        'author_review',
        'corrections_requested',
        'final_approval',
        'ready',
        'published'
    );
exception when duplicate_object then null;
end $$;

do $$ begin
    create type public.publication_status as enum (
        'draft',
        'early_access',
        'published',
        'corrected',
        'retracted'
    );
exception when duplicate_object then null;
end $$;

do $$ begin
    create type public.review_blind_type as enum (
        'single_blind',
        'double_blind',
        'open'
    );
exception when duplicate_object then null;
end $$;


-- ============================================================
-- HELPER FUNCTION
-- ============================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = timezone('utc', now());
    return new;
end;
$$;


-- ============================================================
-- PROFILES
-- ============================================================

create table if not exists public.profiles (
    id uuid primary key references auth.users(id) on delete cascade,

    email citext unique,
    first_name text,
    middle_name text,
    last_name text,

    display_name text,

    avatar_url text,

    orcid text,
    bio text,

    phone text,
    country_code text,

    status public.user_status not null default 'active',

    timezone text default 'UTC',

    metadata jsonb not null default '{}'::jsonb,

    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_profiles_orcid
on public.profiles(orcid);

create index if not exists idx_profiles_email
on public.profiles(email);


-- ============================================================
-- INSTITUTIONS
-- ============================================================

create table if not exists public.institutions (
    id uuid primary key default gen_random_uuid(),

    name text not null,
    short_name text,

    ror_id text,
    country_code text,

    website text,

    metadata jsonb not null default '{}'::jsonb,

    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_institutions_ror
on public.institutions(ror_id);


-- ============================================================
-- JOURNALS
-- ============================================================

create table if not exists public.journals (
    id uuid primary key default gen_random_uuid(),

    organization_id uuid,

    name text not null,
    short_name text,

    slug text not null unique,

    description text,

    issn_print text,
    issn_online text,

    website_url text,

    publisher_name text,

    contact_email citext,

    status public.journal_status not null default 'draft',

    default_language text not null default 'en',

    review_blind_type public.review_blind_type
        not null default 'double_blind',

    reviewers_required integer not null default 3
        check (reviewers_required >= 1),

    review_deadline_days integer not null default 14
        check (review_deadline_days > 0),

    allow_author_suggested_reviewers boolean
        not null default true,

    allow_author_excluded_reviewers boolean
        not null default true,

    apc_enabled boolean not null default false,

    default_apc numeric(12,2) not null default 0
        check (default_apc >= 0),

    currency char(3) not null default 'USD',

    doi_enabled boolean not null default true,

    doi_prefix text,

    doi_suffix_pattern text,

    license_name text,
    license_url text,

    copyright_holder text,

    settings jsonb not null default '{}'::jsonb,

    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_journals_status
on public.journals(status);

create index if not exists idx_journals_slug
on public.journals(slug);


-- ============================================================
-- JOURNAL MEMBERS / RBAC
-- ============================================================

create table if not exists public.journal_members (
    id uuid primary key default gen_random_uuid(),

    journal_id uuid not null
        references public.journals(id) on delete cascade,

    user_id uuid not null
        references public.profiles(id) on delete cascade,

    role public.user_role not null,

    is_active boolean not null default true,

    appointed_at timestamptz not null default timezone('utc', now()),
    removed_at timestamptz,

    metadata jsonb not null default '{}'::jsonb,

    unique(journal_id, user_id, role)
);

create index if not exists idx_journal_members_user
on public.journal_members(user_id);

create index if not exists idx_journal_members_journal_role
on public.journal_members(journal_id, role);


-- ============================================================
-- AUTHOR PROFILES
-- ============================================================

create table if not exists public.author_profiles (
    id uuid primary key default gen_random_uuid(),

    user_id uuid not null unique
        references public.profiles(id) on delete cascade,

    institution_id uuid
        references public.institutions(id) on delete set null,

    department text,
    position text,

    research_interests text[] not null default '{}',

    google_scholar_url text,
    scopus_author_id text,
    researcher_id text,

    metadata jsonb not null default '{}'::jsonb,

    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now())
);


-- ============================================================
-- REVIEWER PROFILES
-- ============================================================

create table if not exists public.reviewer_profiles (
    id uuid primary key default gen_random_uuid(),

    user_id uuid not null unique
        references public.profiles(id) on delete cascade,

    institution_id uuid
        references public.institutions(id) on delete set null,

    expertise text[] not null default '{}',

    keywords text[] not null default '{}',

    max_active_reviews integer not null default 5
        check (max_active_reviews > 0),

    is_available boolean not null default true,

    average_review_days numeric(8,2),

    completed_reviews integer not null default 0,

    declined_reviews integer not null default 0,

    overdue_reviews integer not null default 0,

    quality_score numeric(5,2),

    metadata jsonb not null default '{}'::jsonb,

    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_reviewer_expertise
on public.reviewer_profiles using gin(expertise);

create index if not exists idx_reviewer_keywords
on public.reviewer_profiles using gin(keywords);


-- ============================================================
-- MANUSCRIPTS
-- ============================================================

create table if not exists public.manuscripts (
    id uuid primary key default gen_random_uuid(),

    journal_id uuid not null
        references public.journals(id) on delete restrict,

    manuscript_number text not null,

    title text not null,

    subtitle text,

    abstract text,

    article_type public.article_type not null default 'research_article',

    keywords text[] not null default '{}',

    subject_areas text[] not null default '{}',

    language_code text not null default 'en',

    status public.manuscript_status
        not null default 'draft',

    current_version integer not null default 1,

    current_review_round integer not null default 0,

    submitted_by uuid
        references public.profiles(id) on delete set null,

    corresponding_author_id uuid
        references public.profiles(id) on delete set null,

    assigned_editor_id uuid
        references public.profiles(id) on delete set null,

    technical_checked_at timestamptz,
    editorial_screened_at timestamptz,

    submitted_at timestamptz,

    accepted_at timestamptz,
    rejected_at timestamptz,

    withdrawn_at timestamptz,

    metadata jsonb not null default '{}'::jsonb,

    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now()),

    unique(journal_id, manuscript_number)
);

create index if not exists idx_manuscripts_journal
on public.manuscripts(journal_id);

create index if not exists idx_manuscripts_status
on public.manuscripts(status);

create index if not exists idx_manuscripts_editor
on public.manuscripts(assigned_editor_id);

create index if not exists idx_manuscripts_submitted_at
on public.manuscripts(submitted_at desc);

create index if not exists idx_manuscripts_keywords
on public.manuscripts using gin(keywords);


-- ============================================================
-- MANUSCRIPT AUTHORS
-- ============================================================

create table if not exists public.manuscript_authors (
    id uuid primary key default gen_random_uuid(),

    manuscript_id uuid not null
        references public.manuscripts(id) on delete cascade,

    user_id uuid
        references public.profiles(id) on delete set null,

    first_name text not null,
    middle_name text,
    last_name text not null,

    email citext,

    orcid text,

    institution_id uuid
        references public.institutions(id) on delete set null,

    institution_name_snapshot text,
    department_snapshot text,

    author_order integer not null
        check (author_order > 0),

    is_corresponding boolean not null default false,

    contribution_statement text,

    created_at timestamptz not null default timezone('utc', now()),

    unique(manuscript_id, author_order)
);

create index if not exists idx_manuscript_authors_manuscript
on public.manuscript_authors(manuscript_id);

create index if not exists idx_manuscript_authors_user
on public.manuscript_authors(user_id);


-- ============================================================
-- MANUSCRIPT VERSIONS
-- ============================================================

create table if not exists public.manuscript_versions (
    id uuid primary key default gen_random_uuid(),

    manuscript_id uuid not null
        references public.manuscripts(id) on delete cascade,

    version_number integer not null
        check (version_number > 0),

    revision_round integer not null default 0
        check (revision_round >= 0),

    version_label text,

    change_summary text,

    submitted_by uuid
        references public.profiles(id) on delete set null,

    submitted_at timestamptz,

    created_at timestamptz not null default timezone('utc', now()),

    unique(manuscript_id, version_number)
);

create index if not exists idx_manuscript_versions_manuscript
on public.manuscript_versions(manuscript_id);


-- ============================================================
-- FILES
-- ============================================================

create table if not exists public.manuscript_files (
    id uuid primary key default gen_random_uuid(),

    manuscript_id uuid not null
        references public.manuscripts(id) on delete cascade,

    version_id uuid
        references public.manuscript_versions(id) on delete cascade,

    uploaded_by uuid
        references public.profiles(id) on delete set null,

    file_type public.file_type not null,

    original_filename text not null,

    storage_bucket text not null,

    storage_path text not null,

    mime_type text,

    file_size bigint,

    checksum text,

    page_count integer,

    is_public boolean not null default false,

    metadata jsonb not null default '{}'::jsonb,

    created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_manuscript_files_manuscript
on public.manuscript_files(manuscript_id);

create index if not exists idx_manuscript_files_version
on public.manuscript_files(version_id);

create index if not exists idx_manuscript_files_type
on public.manuscript_files(file_type);


-- ============================================================
-- SUBMISSION DECLARATIONS
-- ============================================================

create table if not exists public.submission_declarations (
    id uuid primary key default gen_random_uuid(),

    manuscript_id uuid not null unique
        references public.manuscripts(id) on delete cascade,

    conflict_of_interest text,
    funding_statement text,
    ethics_statement text,
    data_availability_statement text,
    author_contributions text,
    acknowledgements text,

    originality_confirmed boolean not null default false,
    ethics_confirmed boolean not null default false,
    authorship_confirmed boolean not null default false,
    copyright_confirmed boolean not null default false,

    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now())
);


-- ============================================================
-- SUGGESTED / EXCLUDED REVIEWERS
-- ============================================================

create table if not exists public.manuscript_reviewer_suggestions (
    id uuid primary key default gen_random_uuid(),

    manuscript_id uuid not null
        references public.manuscripts(id) on delete cascade,

    reviewer_name text not null,
    reviewer_email citext,
    institution text,
    expertise text[] not null default '{}',

    reason text,

    created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.manuscript_excluded_reviewers (
    id uuid primary key default gen_random_uuid(),

    manuscript_id uuid not null
        references public.manuscripts(id) on delete cascade,

    reviewer_name text,
    reviewer_email citext,
    reason text,

    created_at timestamptz not null default timezone('utc', now())
);


-- ============================================================
-- EDITORIAL ASSIGNMENTS
-- ============================================================

create table if not exists public.editorial_assignments (
    id uuid primary key default gen_random_uuid(),

    manuscript_id uuid not null
        references public.manuscripts(id) on delete cascade,

    editor_id uuid not null
        references public.profiles(id) on delete restrict,

    assigned_by uuid
        references public.profiles(id) on delete set null,

    assigned_at timestamptz not null default timezone('utc', now()),

    unassigned_at timestamptz,

    is_active boolean not null default true,

    notes text
);

create index if not exists idx_editorial_assignments_editor
on public.editorial_assignments(editor_id);

create index if not exists idx_editorial_assignments_manuscript
on public.editorial_assignments(manuscript_id);


-- ============================================================
-- REVIEW ROUNDS
-- ============================================================

create table if not exists public.review_rounds (
    id uuid primary key default gen_random_uuid(),

    manuscript_id uuid not null
        references public.manuscripts(id) on delete cascade,

    round_number integer not null
        check (round_number > 0),

    required_reviewers integer not null default 3
        check (required_reviewers > 0),

    started_at timestamptz not null default timezone('utc', now()),

    completed_at timestamptz,

    notes text,

    unique(manuscript_id, round_number)
);


-- ============================================================
-- REVIEW INVITATIONS
-- ============================================================

create table if not exists public.reviewer_invitations (
    id uuid primary key default gen_random_uuid(),

    review_round_id uuid not null
        references public.review_rounds(id) on delete cascade,

    reviewer_id uuid not null
        references public.reviewer_profiles(id) on delete restrict,

    invited_by uuid
        references public.profiles(id) on delete set null,

    invitation_token text unique,

    invited_at timestamptz not null default timezone('utc', now()),

    expires_at timestamptz,

    responded_at timestamptz,

    status public.review_status not null default 'invited',

    decline_reason text,

    metadata jsonb not null default '{}'::jsonb
);

create index if not exists idx_reviewer_invitations_reviewer
on public.reviewer_invitations(reviewer_id);

create index if not exists idx_reviewer_invitations_round
on public.reviewer_invitations(review_round_id);


-- ============================================================
-- REVIEW ASSIGNMENTS
-- ============================================================

create table if not exists public.review_assignments (
    id uuid primary key default gen_random_uuid(),

    review_round_id uuid not null
        references public.review_rounds(id) on delete cascade,

    reviewer_id uuid not null
        references public.reviewer_profiles(id) on delete restrict,

    invitation_id uuid
        references public.reviewer_invitations(id) on delete set null,

    status public.review_status not null default 'invited',

    invited_at timestamptz not null default timezone('utc', now()),

    accepted_at timestamptz,

    started_at timestamptz,

    deadline_at timestamptz,

    completed_at timestamptz,

    declined_at timestamptz,

    withdrawn_at timestamptz,

    is_anonymous boolean not null default true,

    conflict_declared boolean not null default false,

    conflict_reason text,

    reminder_count integer not null default 0,

    metadata jsonb not null default '{}'::jsonb
);

create index if not exists idx_review_assignments_reviewer
on public.review_assignments(reviewer_id);

create index if not exists idx_review_assignments_round
on public.review_assignments(review_round_id);

create index if not exists idx_review_assignments_deadline
on public.review_assignments(deadline_at);

create index if not exists idx_review_assignments_status
on public.review_assignments(status);


-- ============================================================
-- REVIEW REPORTS
-- ============================================================

create table if not exists public.review_reports (
    id uuid primary key default gen_random_uuid(),

    review_assignment_id uuid not null unique
        references public.review_assignments(id) on delete cascade,

    originality_score integer
        check (originality_score between 1 and 5),

    methodology_score integer
        check (methodology_score between 1 and 5),

    literature_score integer
        check (literature_score between 1 and 5),

    results_score integer
        check (results_score between 1 and 5),

    discussion_score integer
        check (discussion_score between 1 and 5),

    writing_score integer
        check (writing_score between 1 and 5),

    significance_score integer
        check (significance_score between 1 and 5),

    comments_to_author text,

    confidential_comments_to_editor text,

    recommendation public.review_recommendation
        not null default 'no_recommendation',

    submitted_at timestamptz,

    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now())
);


-- ============================================================
-- REVIEW COMMENTS
-- ============================================================

create table if not exists public.review_comments (
    id uuid primary key default gen_random_uuid(),

    review_report_id uuid not null
        references public.review_reports(id) on delete cascade,

    comment_number integer not null,

    comment_text text not null,

    author_response text,

    response_status text
        check (
            response_status in (
                'pending',
                'addressed',
                'partially_addressed',
                'not_addressed'
            )
        ),

    created_at timestamptz not null default timezone('utc', now()),

    unique(review_report_id, comment_number)
);


-- ============================================================
-- INLINE ANNOTATIONS
-- ============================================================

create table if not exists public.review_annotations (
    id uuid primary key default gen_random_uuid(),

    review_assignment_id uuid not null
        references public.review_assignments(id) on delete cascade,

    version_id uuid not null
        references public.manuscript_versions(id) on delete cascade,

    page_number integer,

    paragraph_index integer,

    start_offset integer,
    end_offset integer,

    selected_text text,

    comment text not null,

    visibility public.annotation_visibility
        not null default 'author_reviewer_editor',

    resolved boolean not null default false,

    created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_review_annotations_assignment
on public.review_annotations(review_assignment_id);

create index if not exists idx_review_annotations_version
on public.review_annotations(version_id);


-- ============================================================
-- EDITORIAL DECISIONS
-- ============================================================

create table if not exists public.editorial_decisions (
    id uuid primary key default gen_random_uuid(),

    manuscript_id uuid not null
        references public.manuscripts(id) on delete cascade,

    review_round_id uuid
        references public.review_rounds(id) on delete set null,

    editor_id uuid not null
        references public.profiles(id) on delete restrict,

    decision public.decision_type not null,

    system_recommendation public.review_recommendation,

    accept_votes integer not null default 0,
    minor_revision_votes integer not null default 0,
    major_revision_votes integer not null default 0,
    reject_votes integer not null default 0,

    editor_reason text,

    override_system_recommendation boolean not null default false,

    created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_editorial_decisions_manuscript
on public.editorial_decisions(manuscript_id);


-- ============================================================
-- REVISION REQUESTS
-- ============================================================

create table if not exists public.revision_requests (
    id uuid primary key default gen_random_uuid(),

    manuscript_id uuid not null
        references public.manuscripts(id) on delete cascade,

    decision_id uuid
        references public.editorial_decisions(id) on delete set null,

    revision_round integer not null
        check (revision_round > 0),

    due_at timestamptz,

    instructions text,

    submitted_at timestamptz,

    completed_at timestamptz,

    created_at timestamptz not null default timezone('utc', now())
);


-- ============================================================
-- AUTHOR RESPONSES
-- ============================================================

create table if not exists public.author_responses (
    id uuid primary key default gen_random_uuid(),

    revision_request_id uuid not null
        references public.revision_requests(id) on delete cascade,

    review_comment_id uuid
        references public.review_comments(id) on delete cascade,

    response_text text not null,

    response_status text
        check (
            response_status in (
                'pending',
                'addressed',
                'partially_addressed',
                'not_addressed'
            )
        ),

    created_at timestamptz not null default timezone('utc', now())
);


-- ============================================================
-- WORKFLOW EVENTS
-- ============================================================

create table if not exists public.workflow_events (
    id uuid primary key default gen_random_uuid(),

    manuscript_id uuid
        references public.manuscripts(id) on delete cascade,

    actor_id uuid
        references public.profiles(id) on delete set null,

    from_status public.manuscript_status,
    to_status public.manuscript_status,

    event_type text not null,

    description text,

    metadata jsonb not null default '{}'::jsonb,

    created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_workflow_events_manuscript
on public.workflow_events(manuscript_id, created_at desc);


-- ============================================================
-- APC
-- ============================================================

create table if not exists public.apcs (
    id uuid primary key default gen_random_uuid(),

    manuscript_id uuid not null unique
        references public.manuscripts(id) on delete cascade,

    base_amount numeric(12,2) not null default 0,
    discount_amount numeric(12,2) not null default 0,
    waiver_amount numeric(12,2) not null default 0,

    tax_amount numeric(12,2) not null default 0,

    total_amount numeric(12,2) not null default 0,

    currency char(3) not null default 'USD',

    status public.apc_status not null default 'calculated',

    calculated_at timestamptz,
    paid_at timestamptz,

    metadata jsonb not null default '{}'::jsonb,

    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now())
);


-- ============================================================
-- APC WAIVERS
-- ============================================================

create table if not exists public.apc_waivers (
    id uuid primary key default gen_random_uuid(),

    apc_id uuid not null
        references public.apcs(id) on delete cascade,

    requested_by uuid
        references public.profiles(id) on delete set null,

    approved_by uuid
        references public.profiles(id) on delete set null,

    requested_amount numeric(12,2),

    approved_amount numeric(12,2),

    reason text,

    status text not null default 'requested'
        check(status in (
            'requested',
            'approved',
            'rejected',
            'cancelled'
        )),

    requested_at timestamptz not null default timezone('utc', now()),
    resolved_at timestamptz
);


-- ============================================================
-- INVOICES
-- ============================================================

create table if not exists public.invoices (
    id uuid primary key default gen_random_uuid(),

    apc_id uuid not null
        references public.apcs(id) on delete restrict,

    invoice_number text not null unique,

    amount numeric(12,2) not null,
    currency char(3) not null default 'USD',

    status public.invoice_status not null default 'draft',

    issued_at timestamptz,
    due_at timestamptz,

    paid_at timestamptz,

    billing_name text,
    billing_email citext,
    billing_address text,

    metadata jsonb not null default '{}'::jsonb,

    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now())
);


-- ============================================================
-- PAYMENTS
-- ============================================================

create table if not exists public.payments (
    id uuid primary key default gen_random_uuid(),

    invoice_id uuid not null
        references public.invoices(id) on delete restrict,

    provider text,

    provider_payment_id text,

    amount numeric(12,2) not null,

    currency char(3) not null,

    status public.payment_status not null default 'pending',

    payment_method text,

    provider_event_id text,

    paid_at timestamptz,

    metadata jsonb not null default '{}'::jsonb,

    created_at timestamptz not null default timezone('utc', now()),

    unique(provider, provider_payment_id)
);


-- ============================================================
-- VOLUMES
-- ============================================================

create table if not exists public.volumes (
    id uuid primary key default gen_random_uuid(),

    journal_id uuid not null
        references public.journals(id) on delete restrict,

    volume_number integer not null
        check(volume_number > 0),

    year integer not null,

    title text,

    description text,

    published_at timestamptz,

    created_at timestamptz not null default timezone('utc', now()),

    unique(journal_id, volume_number)
);


-- ============================================================
-- ISSUES
-- ============================================================

create table if not exists public.issues (
    id uuid primary key default gen_random_uuid(),

    journal_id uuid not null
        references public.journals(id) on delete restrict,

    volume_id uuid
        references public.volumes(id) on delete set null,

    issue_number integer not null
        check(issue_number > 0),

    title text,

    description text,

    cover_image_url text,

    publication_date date,

    is_special_issue boolean not null default false,

    created_at timestamptz not null default timezone('utc', now()),

    unique(journal_id, volume_id, issue_number)
);


-- ============================================================
-- ARTICLES
-- ============================================================

create table if not exists public.articles (
    id uuid primary key default gen_random_uuid(),

    manuscript_id uuid not null unique
        references public.manuscripts(id) on delete restrict,

    journal_id uuid not null
        references public.journals(id) on delete restrict,

    issue_id uuid
        references public.issues(id) on delete set null,

    article_number text not null,

    slug text not null unique,

    title text not null,

    abstract text,

    article_type public.article_type not null,

    publication_status public.publication_status
        not null default 'draft',

    received_at timestamptz,
    revised_at timestamptz,
    accepted_at timestamptz,
    published_at timestamptz,

    first_page integer,
    last_page integer,

    article_number_label text,

    license_name text,
    license_url text,

    copyright_holder text,

    citation_text text,

    metadata jsonb not null default '{}'::jsonb,

    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now()),

    unique(journal_id, article_number)
);

create index if not exists idx_articles_journal
on public.articles(journal_id);

create index if not exists idx_articles_issue
on public.articles(issue_id);

create index if not exists idx_articles_status
on public.articles(publication_status);

create index if not exists idx_articles_published
on public.articles(published_at desc);


-- ============================================================
-- ARTICLE AUTHORS
-- ============================================================

create table if not exists public.article_authors (
    id uuid primary key default gen_random_uuid(),

    article_id uuid not null
        references public.articles(id) on delete cascade,

    user_id uuid
        references public.profiles(id) on delete set null,

    first_name text not null,
    middle_name text,
    last_name text not null,

    orcid text,

    affiliation text,

    author_order integer not null
        check(author_order > 0),

    is_corresponding boolean not null default false,

    contribution_statement text,

    unique(article_id, author_order)
);


-- ============================================================
-- ARTICLE VERSIONS
-- ============================================================

create table if not exists public.article_versions (
    id uuid primary key default gen_random_uuid(),

    article_id uuid not null
        references public.articles(id) on delete cascade,

    version_number integer not null,

    version_label text,

    status public.publication_status
        not null default 'draft',

    published_at timestamptz,

    created_at timestamptz not null default timezone('utc', now()),

    unique(article_id, version_number)
);


-- ============================================================
-- PRODUCTION
-- ============================================================

create table if not exists public.production_records (
    id uuid primary key default gen_random_uuid(),

    article_id uuid not null unique
        references public.articles(id) on delete cascade,

    status public.production_status
        not null default 'not_started',

    assigned_copyeditor_id uuid
        references public.profiles(id) on delete set null,

    assigned_production_editor_id uuid
        references public.profiles(id) on delete set null,

    started_at timestamptz,

    copyediting_completed_at timestamptz,
    typesetting_completed_at timestamptz,

    proof_sent_at timestamptz,
    proof_approved_at timestamptz,

    final_approved_at timestamptz,

    notes text,

    metadata jsonb not null default '{}'::jsonb,

    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now())
);


-- ============================================================
-- DOI RECORDS
-- ============================================================

create table if not exists public.doi_records (
    id uuid primary key default gen_random_uuid(),

    article_id uuid not null unique
        references public.articles(id) on delete cascade,

    doi text not null unique,

    doi_url text not null,

    prefix text not null,
    suffix text not null,

    registration_agency text default 'Crossref',

    registration_status text not null default 'pending'
        check(registration_status in (
            'pending',
            'queued',
            'registered',
            'failed',
            'updated'
        )),

    registered_at timestamptz,

    last_deposit_at timestamptz,

    last_error text,

    metadata jsonb not null default '{}'::jsonb,

    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now())
);


-- ============================================================
-- CITATIONS / REFERENCES
-- ============================================================

create table if not exists public.article_references (
    id uuid primary key default gen_random_uuid(),

    article_id uuid not null
        references public.articles(id) on delete cascade,

    reference_number integer not null,

    raw_reference text not null,

    title text,
    authors text,
    journal_name text,

    year integer,

    doi text,
    url text,

    metadata jsonb not null default '{}'::jsonb,

    unique(article_id, reference_number)
);


-- ============================================================
-- ARTICLE METADATA
-- ============================================================

create table if not exists public.article_metadata (
    id uuid primary key default gen_random_uuid(),

    article_id uuid not null unique
        references public.articles(id) on delete cascade,

    subjects text[] not null default '{}',
    keywords text[] not null default '{}',

    funding_statement text,
    data_availability text,
    ethics_statement text,
    conflict_of_interest text,

    supplementary_information text,

    jats_xml_path text,
    html_path text,
    pdf_path text,

    metadata jsonb not null default '{}'::jsonb,

    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now())
);


-- ============================================================
-- NOTIFICATIONS
-- ============================================================

create table if not exists public.notifications (
    id uuid primary key default gen_random_uuid(),

    user_id uuid not null
        references public.profiles(id) on delete cascade,

    journal_id uuid
        references public.journals(id) on delete cascade,

    manuscript_id uuid
        references public.manuscripts(id) on delete cascade,

    type text not null,

    title text not null,
    message text not null,

    action_url text,

    is_read boolean not null default false,

    read_at timestamptz,

    metadata jsonb not null default '{}'::jsonb,

    created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_notifications_user
on public.notifications(user_id, is_read, created_at desc);


-- ============================================================
-- EMAIL LOG
-- ============================================================

create table if not exists public.email_logs (
    id uuid primary key default gen_random_uuid(),

    user_id uuid
        references public.profiles(id) on delete set null,

    manuscript_id uuid
        references public.manuscripts(id) on delete set null,

    recipient_email citext not null,

    template_name text not null,

    subject text not null,

    provider text,

    provider_message_id text,

    status text not null default 'queued'
        check(status in (
            'queued',
            'sent',
            'delivered',
            'failed',
            'bounced'
        )),

    sent_at timestamptz,

    error_message text,

    metadata jsonb not null default '{}'::jsonb,

    created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_email_logs_manuscript
on public.email_logs(manuscript_id);

create index if not exists idx_email_logs_recipient
on public.email_logs(recipient_email);


-- ============================================================
-- AUDIT LOG
-- ============================================================

create table if not exists public.audit_logs (
    id uuid primary key default gen_random_uuid(),

    actor_id uuid
        references public.profiles(id) on delete set null,

    journal_id uuid
        references public.journals(id) on delete set null,

    manuscript_id uuid
        references public.manuscripts(id) on delete set null,

    action text not null,

    entity_type text,
    entity_id uuid,

    old_data jsonb,
    new_data jsonb,

    ip_address inet,
    user_agent text,

    metadata jsonb not null default '{}'::jsonb,

    created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_audit_logs_actor
on public.audit_logs(actor_id);

create index if not exists idx_audit_logs_manuscript
on public.audit_logs(manuscript_id);

create index if not exists idx_audit_logs_created
on public.audit_logs(created_at desc);


-- ============================================================
-- SYSTEM WORKER JOBS
-- ============================================================

create table if not exists public.system_jobs (
    id uuid primary key default gen_random_uuid(),

    job_type text not null,

    entity_type text,
    entity_id uuid,

    status text not null default 'pending'
        check(status in (
            'pending',
            'processing',
            'completed',
            'failed',
            'cancelled'
        )),

    attempts integer not null default 0,

    max_attempts integer not null default 5,

    scheduled_at timestamptz not null default timezone('utc', now()),

    started_at timestamptz,
    completed_at timestamptz,

    error_message text,

    payload jsonb not null default '{}'::jsonb,

    created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_system_jobs_status
on public.system_jobs(status, scheduled_at);


-- ============================================================
-- UPDATED_AT TRIGGERS
-- ============================================================

create trigger profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger journals_updated_at
before update on public.journals
for each row execute function public.set_updated_at();

create trigger author_profiles_updated_at
before update on public.author_profiles
for each row execute function public.set_updated_at();

create trigger reviewer_profiles_updated_at
before update on public.reviewer_profiles
for each row execute function public.set_updated_at();

create trigger manuscripts_updated_at
before update on public.manuscripts
for each row execute function public.set_updated_at();

create trigger submission_declarations_updated_at
before update on public.submission_declarations
for each row execute function public.set_updated_at();

create trigger review_reports_updated_at
before update on public.review_reports
for each row execute function public.set_updated_at();

create trigger apcs_updated_at
before update on public.apcs
for each row execute function public.set_updated_at();

create trigger invoices_updated_at
before update on public.invoices
for each row execute function public.set_updated_at();

create trigger articles_updated_at
before update on public.articles
for each row execute function public.set_updated_at();

create trigger production_records_updated_at
before update on public.production_records
for each row execute function public.set_updated_at();

create trigger doi_records_updated_at
before update on public.doi_records
for each row execute function public.set_updated_at();

create trigger article_metadata_updated_at
before update on public.article_metadata
for each row execute function public.set_updated_at();


-- ============================================================
-- MANUSCRIPT NUMBER GENERATOR
-- ============================================================

create sequence if not exists public.manuscript_sequence;

create or replace function public.generate_manuscript_number(
    p_journal_id uuid
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
    journal_slug text;
    sequence_number bigint;
begin
    select upper(left(slug, 5))
    into journal_slug
    from public.journals
    where id = p_journal_id;

    if journal_slug is null then
        journal_slug := 'JRNL';
    end if;

    sequence_number := nextval('public.manuscript_sequence');

    return journal_slug || '-' ||
           to_char(current_date, 'YYYY') || '-' ||
           lpad(sequence_number::text, 6, '0');
end;
$$;

grant execute on function public.generate_manuscript_number(uuid) to authenticated, service_role, anon;
grant usage, select on sequence public.manuscript_sequence to authenticated, service_role, anon;


-- ============================================================
-- ARTICLE NUMBER GENERATOR
-- ============================================================

create sequence if not exists public.article_sequence;

create or replace function public.generate_article_number()
returns text
language plpgsql
as $$
declare
    sequence_number bigint;
begin
    sequence_number := nextval('public.article_sequence');

    return to_char(current_date, 'YYYY') ||
           '-' ||
           lpad(sequence_number::text, 6, '0');
end;
$$;


-- ============================================================
-- DOI SUFFIX GENERATOR
-- ============================================================

create sequence if not exists public.doi_sequence;

create or replace function public.generate_doi_suffix()
returns text
language plpgsql
as $$
declare
    sequence_number bigint;
begin
    sequence_number := nextval('public.doi_sequence');

    return to_char(current_date, 'YYYY') ||
           '.' ||
           lpad(sequence_number::text, 6, '0');
end;
$$;


-- ============================================================
-- REVIEW VOTING FUNCTION
-- ============================================================

create or replace function public.calculate_review_recommendation(
    p_review_round_id uuid
)
returns public.review_recommendation
language plpgsql
as $$
declare
    accept_count integer;
    minor_count integer;
    major_count integer;
    reject_count integer;
begin

    select
        count(*) filter (
            where rr.recommendation = 'accept'
        ),
        count(*) filter (
            where rr.recommendation = 'minor_revision'
        ),
        count(*) filter (
            where rr.recommendation = 'major_revision'
        ),
        count(*) filter (
            where rr.recommendation = 'reject'
        )
    into
        accept_count,
        minor_count,
        major_count,
        reject_count
    from public.review_assignments ra
    join public.review_reports rr
        on rr.review_assignment_id = ra.id
    where ra.review_round_id = p_review_round_id
      and ra.status = 'completed';

    -- Two or more rejections
    if reject_count >= 2 then
        return 'reject';
    end if;

    -- Two or more accept recommendations
    if accept_count >= 2 then
        return 'accept';
    end if;

    -- Two or more major revisions
    if major_count >= 2 then
        return 'major_revision';
    end if;

    -- Minor / mixed positive outcome
    if (
        accept_count +
        minor_count
    ) >= 2 then
        return 'minor_revision';
    end if;

    return 'no_recommendation';
end;
$$;


-- ============================================================
-- REVIEW COMPLETION CHECK
-- ============================================================

create or replace function public.review_round_completed(
    p_review_round_id uuid
)
returns boolean
language plpgsql
as $$
declare
    required_count integer;
    completed_count integer;
begin

    select required_reviewers
    into required_count
    from public.review_rounds
    where id = p_review_round_id;

    select count(*)
    into completed_count
    from public.review_assignments
    where review_round_id = p_review_round_id
      and status = 'completed';

    return completed_count >= required_count;
end;
$$;


-- ============================================================
-- REVIEWER ACTIVE REVIEW COUNT
-- ============================================================

create or replace function public.reviewer_active_review_count(
    p_reviewer_id uuid
)
returns integer
language sql
stable
as $$
    select count(*)::integer
    from public.review_assignments
    where reviewer_id = p_reviewer_id
      and status in (
          'accepted',
          'reviewing'
      );
$$;


-- ============================================================
-- RLS
-- ============================================================

alter table public.profiles enable row level security;
alter table public.institutions enable row level security;
alter table public.journals enable row level security;
alter table public.journal_members enable row level security;
alter table public.author_profiles enable row level security;
alter table public.reviewer_profiles enable row level security;
alter table public.manuscripts enable row level security;
alter table public.manuscript_authors enable row level security;
alter table public.manuscript_versions enable row level security;
alter table public.manuscript_files enable row level security;
alter table public.submission_declarations enable row level security;
alter table public.manuscript_reviewer_suggestions enable row level security;
alter table public.manuscript_excluded_reviewers enable row level security;
alter table public.editorial_assignments enable row level security;
alter table public.review_rounds enable row level security;
alter table public.reviewer_invitations enable row level security;
alter table public.review_assignments enable row level security;
alter table public.review_reports enable row level security;
alter table public.review_comments enable row level security;
alter table public.review_annotations enable row level security;
alter table public.editorial_decisions enable row level security;
alter table public.revision_requests enable row level security;
alter table public.author_responses enable row level security;
alter table public.workflow_events enable row level security;
alter table public.apcs enable row level security;
alter table public.apc_waivers enable row level security;
alter table public.invoices enable row level security;
alter table public.payments enable row level security;
alter table public.volumes enable row level security;
alter table public.issues enable row level security;
alter table public.articles enable row level security;
alter table public.article_authors enable row level security;
alter table public.article_versions enable row level security;
alter table public.production_records enable row level security;
alter table public.doi_records enable row level security;
alter table public.article_references enable row level security;
alter table public.article_metadata enable row level security;
alter table public.notifications enable row level security;
alter table public.email_logs enable row level security;
alter table public.audit_logs enable row level security;
alter table public.system_jobs enable row level security;


-- ============================================================
-- SECURITY HELPERS
-- ============================================================

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public.journal_members jm
        where jm.user_id = auth.uid()
          and jm.role = 'super_admin'
          and jm.is_active = true
    );
$$;

create or replace function public.is_journal_member(
    p_journal_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public.journal_members jm
        where jm.journal_id = p_journal_id
          and jm.user_id = auth.uid()
          and jm.is_active = true
    );
$$;

create or replace function public.has_journal_role(
    p_journal_id uuid,
    p_roles public.user_role[]
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public.journal_members jm
        where jm.journal_id = p_journal_id
          and jm.user_id = auth.uid()
          and jm.is_active = true
          and jm.role = any(p_roles)
    );
$$;

-- security definer (RLS-bypassing) helpers so policies on related tables
-- do not recursively re-trigger each other's policies.
create or replace function public.is_manuscript_owner(
    p_manuscript_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public.manuscripts m
        where m.id = p_manuscript_id
          and m.submitted_by = auth.uid()
    );
$$;

create or replace function public.is_manuscript_author(
    p_manuscript_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public.manuscripts m
        where m.id = p_manuscript_id
          and (
              m.submitted_by = auth.uid()
              or exists (
                  select 1
                  from public.manuscript_authors ma
                  where ma.manuscript_id = m.id
                    and ma.user_id = auth.uid()
              )
          )
    );
$$;


-- ============================================================
-- PROFILE POLICIES
-- ============================================================

create policy "users can view own profile"
on public.profiles
for select
to authenticated
using (id = auth.uid());

create policy "users can update own profile"
on public.profiles
for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

create policy "users can create own profile"
on public.profiles
for insert
to authenticated
with check (id = auth.uid());


-- ============================================================
-- INSTITUTION POLICIES
-- ============================================================

-- Institutions are a shared reference table: any signed-in user
-- can look up existing institutions or add a new one.
create policy "authenticated users can view institutions"
on public.institutions
for select
to authenticated
using (true);

create policy "authenticated users can create institutions"
on public.institutions
for insert
to authenticated
with check (true);


-- ============================================================
-- AUTHOR PROFILE POLICIES
-- ============================================================

create policy "users can view own author profile"
on public.author_profiles
for select
to authenticated
using (user_id = auth.uid());

create policy "users can create own author profile"
on public.author_profiles
for insert
to authenticated
with check (user_id = auth.uid());

create policy "users can update own author profile"
on public.author_profiles
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());


-- ============================================================
-- REVIEWER PROFILE POLICIES
-- ============================================================

create policy "users can view own reviewer profile"
on public.reviewer_profiles
for select
to authenticated
using (user_id = auth.uid());

create policy "users can create own reviewer profile"
on public.reviewer_profiles
for insert
to authenticated
with check (user_id = auth.uid());

create policy "users can update own reviewer profile"
on public.reviewer_profiles
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());


-- ============================================================
-- JOURNAL POLICIES
-- ============================================================

create policy "active journals publicly visible"
on public.journals
for select
to anon, authenticated
using (status = 'active');

create policy "journal members can view journal"
on public.journals
for select
to authenticated
using (
    public.is_journal_member(id)
);

create policy "journal admins manage journals"
on public.journals
for all
to authenticated
using (
    public.has_journal_role(
        id,
        array[
            'journal_manager'::public.user_role,
            'journal_admin'::public.user_role,
            'super_admin'::public.user_role
        ]
    )
)
with check (
    public.has_journal_role(
        id,
        array[
            'journal_manager'::public.user_role,
            'journal_admin'::public.user_role,
            'super_admin'::public.user_role
        ]
    )
);


-- ============================================================
-- MANUSCRIPT AUTHOR ACCESS
-- ============================================================

create policy "authors can view their manuscripts"
on public.manuscripts
for select
to authenticated
using (
    submitted_by = auth.uid()
    or corresponding_author_id = auth.uid()
    or exists (
        select 1
        from public.manuscript_authors ma
        where ma.manuscript_id = manuscripts.id
          and ma.user_id = auth.uid()
    )
    or public.is_journal_member(journal_id)
);

create policy "authors can create manuscripts"
on public.manuscripts
for insert
to authenticated
with check (
    submitted_by = auth.uid()
);

create policy "authors can update draft manuscripts"
on public.manuscripts
for update
to authenticated
using (
    submitted_by = auth.uid()
    and status in (
        'draft',
        'returned_to_author',
        'minor_revision',
        'major_revision',
        'revision_submitted'
    )
)
with check (
    submitted_by = auth.uid()
);


-- ============================================================
-- MANUSCRIPT-RELATED AUTHOR POLICIES
-- ============================================================
-- Authors need to read/write the rows that make up their own
-- manuscripts: authors, versions, files, declarations,
-- suggested/excluded reviewers, review rounds and workflow events.
-- All policies scope to manuscripts.submitted_by = auth.uid().

create policy "authors can view manuscript authors"
on public.manuscript_authors
for select
to authenticated
using (
    public.is_manuscript_author(manuscript_authors.manuscript_id)
);

create policy "authors can manage manuscript authors"
on public.manuscript_authors
for insert
to authenticated
with check (
    public.is_manuscript_owner(manuscript_authors.manuscript_id)
);

create policy "authors can update manuscript authors"
on public.manuscript_authors
for update
to authenticated
using (
    public.is_manuscript_author(manuscript_authors.manuscript_id)
)
with check (
    public.is_manuscript_author(manuscript_authors.manuscript_id)
);

create policy "authors can delete manuscript authors"
on public.manuscript_authors
for delete
to authenticated
using (
    public.is_manuscript_author(manuscript_authors.manuscript_id)
);

create policy "authors can view manuscript versions"
on public.manuscript_versions
for select
to authenticated
using (
    public.is_manuscript_owner(manuscript_versions.manuscript_id)
);

create policy "authors can create manuscript versions"
on public.manuscript_versions
for insert
to authenticated
with check (
    public.is_manuscript_owner(manuscript_versions.manuscript_id)
);

create policy "authors can view manuscript files"
on public.manuscript_files
for select
to authenticated
using (
    public.is_manuscript_owner(manuscript_files.manuscript_id)
);

create policy "authors can upload manuscript files"
on public.manuscript_files
for insert
to authenticated
with check (
    public.is_manuscript_owner(manuscript_files.manuscript_id)
);

create policy "authors can update manuscript files"
on public.manuscript_files
for update
to authenticated
using (
    public.is_manuscript_owner(manuscript_files.manuscript_id)
)
with check (
    public.is_manuscript_owner(manuscript_files.manuscript_id)
);

create policy "authors can delete manuscript files"
on public.manuscript_files
for delete
to authenticated
using (
    public.is_manuscript_owner(manuscript_files.manuscript_id)
);

create policy "authors can view declarations"
on public.submission_declarations
for select
to authenticated
using (
    public.is_manuscript_owner(submission_declarations.manuscript_id)
);

create policy "authors can manage declarations"
on public.submission_declarations
for insert
to authenticated
with check (
    public.is_manuscript_owner(submission_declarations.manuscript_id)
);

create policy "authors can update declarations"
on public.submission_declarations
for update
to authenticated
using (
    public.is_manuscript_owner(submission_declarations.manuscript_id)
)
with check (
    public.is_manuscript_owner(submission_declarations.manuscript_id)
);

create policy "authors can view suggested reviewers"
on public.manuscript_reviewer_suggestions
for select
to authenticated
using (
    public.is_manuscript_owner(manuscript_reviewer_suggestions.manuscript_id)
);

create policy "authors can manage suggested reviewers"
on public.manuscript_reviewer_suggestions
for insert
to authenticated
with check (
    public.is_manuscript_owner(manuscript_reviewer_suggestions.manuscript_id)
);

create policy "authors can view excluded reviewers"
on public.manuscript_excluded_reviewers
for select
to authenticated
using (
    public.is_manuscript_owner(manuscript_excluded_reviewers.manuscript_id)
);

create policy "authors can manage excluded reviewers"
on public.manuscript_excluded_reviewers
for insert
to authenticated
with check (
    public.is_manuscript_owner(manuscript_excluded_reviewers.manuscript_id)
);

create policy "authors can view workflow events"
on public.workflow_events
for select
to authenticated
using (
    public.is_manuscript_owner(workflow_events.manuscript_id)
);


-- ============================================================
-- EDITORIAL ACCESS
-- ============================================================

create policy "editors can view journal manuscripts"
on public.manuscripts
for select
to authenticated
using (
    public.has_journal_role(
        journal_id,
        array[
            'editor'::public.user_role,
            'section_editor'::public.user_role,
            'editor_in_chief'::public.user_role,
            'managing_editor'::public.user_role,
            'journal_manager'::public.user_role,
            'journal_admin'::public.user_role,
            'super_admin'::public.user_role
        ]
    )
);


-- ============================================================
-- REVIEWER ASSIGNMENT ACCESS
-- ============================================================

-- Helper: resolve the reviewer_profiles row for the current user,
-- RLS-bypassing so reviewer policies don't recurse.
create or replace function public.current_reviewer_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
    select rp.id
    from public.reviewer_profiles rp
    where rp.user_id = auth.uid()
    limit 1;
$$;

create or replace function public.is_assigned_reviewer(p_round_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public.review_assignments ra
        where ra.review_round_id = p_round_id
          and ra.reviewer_id = public.current_reviewer_id()
    );
$$;

create policy "reviewers see own assignments"
on public.review_assignments
for select
to authenticated
using (reviewer_id = public.current_reviewer_id());

create policy "reviewers can update own assignments"
on public.review_assignments
for update
to authenticated
using (reviewer_id = public.current_reviewer_id())
with check (reviewer_id = public.current_reviewer_id());

create policy "reviewers see own invitations"
on public.reviewer_invitations
for select
to authenticated
using (reviewer_id = public.current_reviewer_id());

create policy "reviewers can update own invitations"
on public.reviewer_invitations
for update
to authenticated
using (reviewer_id = public.current_reviewer_id())
with check (reviewer_id = public.current_reviewer_id());

create policy "reviewers see assigned rounds"
on public.review_rounds
for select
to authenticated
using (public.is_assigned_reviewer(review_rounds.id));

create policy "reviewers see assigned manuscripts"
on public.manuscripts
for select
to authenticated
using (
    exists (
        select 1
        from public.review_rounds rr
        where rr.manuscript_id = manuscripts.id
          and public.is_assigned_reviewer(rr.id)
    )
);

create policy "accepted manuscripts publicly visible"
on public.manuscripts
for select
to anon, authenticated
using (status in ('accepted', 'ready_to_publish'));


-- ============================================================
-- REVIEW REPORT ACCESS
-- ============================================================

create policy "reviewers manage own review reports"
on public.review_reports
for all
to authenticated
using (
    exists (
        select 1
        from public.review_assignments ra
        join public.reviewer_profiles rp
          on rp.id = ra.reviewer_id
        where ra.id = review_reports.review_assignment_id
          and rp.user_id = auth.uid()
    )
)
with check (
    exists (
        select 1
        from public.review_assignments ra
        join public.reviewer_profiles rp
          on rp.id = ra.reviewer_id
        where ra.id = review_reports.review_assignment_id
          and rp.user_id = auth.uid()
    )
);


-- ============================================================
-- NOTIFICATION POLICIES
-- ============================================================

create policy "users view own notifications"
on public.notifications
for select
to authenticated
using (
    user_id = auth.uid()
);

create policy "users update own notifications"
on public.notifications
for update
to authenticated
using (
    user_id = auth.uid()
)
with check (
    user_id = auth.uid()
);


-- ============================================================
-- PUBLIC ARTICLE ACCESS
-- ============================================================

create policy "published articles publicly visible"
on public.articles
for select
to anon, authenticated
using (
    publication_status in (
        'early_access',
        'published',
        'corrected'
    )
);


create policy "published article authors visible"
on public.article_authors
for select
to anon, authenticated
using (
    exists (
        select 1
        from public.articles a
        where a.id = article_authors.article_id
          and a.publication_status in (
              'early_access',
              'published',
              'corrected'
          )
    )
);


create policy "published volumes publicly visible"
on public.volumes
for select
to anon, authenticated
using (
    published_at is not null
);


create policy "published issues publicly visible"
on public.issues
for select
to anon, authenticated
using (
    publication_date is not null
);


-- ============================================================
-- SERVICE ROLE / BACKEND NOTE
-- ============================================================

-- IMPORTANT:
-- Do NOT expose the service_role key to the browser.
-- Background workers / trusted Edge Functions may use service_role.
-- All browser-side operations should use the anon/publishable key
-- and RLS.

commit;