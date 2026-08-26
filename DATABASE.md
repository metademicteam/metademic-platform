# DATABASE

Supabase Postgres — schema at `schema.sql` (already executed). This doc is a map; application adapts to the actual existing schema, never recreates it.

## Enums

`user_status`, `journal_status`, `manuscript_status` (draft … published/retracted, 24 values), `article_type` (12), `user_role` (12), `review_status`, `review_recommendation`, `decision_type`, `file_type`, `annotation_visibility`, `apc_status`, `invoice_status`, `payment_status`, `production_status`, `publication_status`, `review_blind_type`.

## Core Tables

- **profiles** (id FK auth.users, email citext, orcid, bio, country_code, status, metadata)
- **institutions** (name, ror_id)
- **journals** (slug unique, status, review_blind_type, reviewers_required, review_deadline_days, apc_enabled, default_apc, doi_prefix, settings jsonb)
- **journal_members** (journal_id, user_id, role, is_active, unique(journal_id,user_id,role)) — RBAC is journal-scoped.
- **author_profiles**, **reviewer_profiles** (institution, expertise/keywords GIN, is_available, stats)
- **manuscripts** (journal_id, manuscript_number unique(journal_id,number), title, abstract, article_type, keywords GIN, subject_areas, status, current_version, current_review_round, submitted_by, corresponding_author_id, assigned_editor_id)
- **manuscript_authors** (manuscript_id, user_id, author_order unique, is_corresponding)
- **manuscript_versions** (manuscript_id, version_number unique, revision_round, change_summary)
- **manuscript_files** (manuscript_id, version_id, uploaded_by, file_type, storage_bucket/path, mime_type, file_size, checksum, is_public, metadata jsonb with cloudinary public_id/secure_url)
- **submission_declarations**, **manuscript_reviewer_suggestions**, **manuscript_excluded_reviewers**
- **editorial_assignments**, **review_rounds** (required_reviewers), **reviewer_invitations** (invitation_token), **review_assignments** (deadline_at, conflict_declared), **review_reports** (7 scores 1-5, recommendations), **review_comments**, **review_annotations** (page/offset/visibility)
- **editorial_decisions** (system_recommendation, vote counts, override flag), **revision_requests**, **author_responses**
- **workflow_events** (from_status, to_status, event_type)
- **apcs**, **apc_waivers**, **invoices** (invoice_number unique), **payments** (provider, provider_payment_id unique)
- **volumes**, **issues**, **articles** (manuscript_id unique, slug unique, publication_status, published_at), **article_authors**, **article_versions**, **production_records**, **doi_records** (doi unique, registration_status), **article_references**, **article_metadata** (jats/html/pdf paths)
- **notifications** (user_id, is_read), **email_logs**, **audit_logs**, **system_jobs**

## Functions/Triggers

- `set_updated_at()` trigger on 14 tables
- `generate_manuscript_number(p_journal_id)`, `generate_article_number()`, `generate_doi_suffix()` (sequences)
- `calculate_review_recommendation(p_review_round_id)` — 2 rejects → reject, 2 accepts → accept, 2 majors → major, accept+minor ≥2 → minor, else no_recommendation
- `review_round_completed(p_review_round_id)`, `reviewer_active_review_count(p_reviewer_id)`
- Security helpers: `is_super_admin()`, `is_journal_member(p_journal_id)`, `has_journal_role(p_journal_id, p_roles)` (security definer, search_path=public)

## RLS

- Enabled on all tables. Policies for `profiles`, `journals`, `manuscripts`, `review_assignments`, `review_reports`, `notifications`, `articles` are in `schema.sql`. Missing policies for ~20 tables are added in `supabase/migrations/20260825_fix_rls.sql` (idempotent). App also uses `createAdminClient` after auth check where RLS would block.
- Never disable RLS; never expose `service_role` to browser.

## Indexes

GIN on `reviewer_profiles.expertise/keywords`, `manuscripts.keywords`, `notifications(user_id,is_read,created_at)`, plus FK indexes.

## Migrations

- Do not drop/recreate. New fixes go to `supabase/migrations/*.sql` and are applied via Supabase SQL Editor or `psql`.
