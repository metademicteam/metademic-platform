-- ============================================================
-- FIX: Missing RLS policies for author submission workflow
-- ============================================================
-- Run this in: Supabase Dashboard -> SQL Editor -> New query -> Run
-- Idempotent: safe to run more than once.
--
-- Fixes 403/500 errors on:
--   - uploading files (manuscript_files)
--   - saving authors (manuscript_authors)
--   - saving declarations (submission_declarations)
--   - saving suggested/excluded reviewers
--   - reading versions / workflow events
--   - creating own profile, author/reviewer profiles
--   - reading/creating institutions
--   - infinite RLS recursion on manuscripts -> manuscript_authors
--
-- The security-definer helper functions break the circular policy
-- dependency (manuscripts policy reads manuscript_authors, and
-- manuscript_authors policy reads manuscripts).
-- ============================================================

-- ------------------------------------------------------------
-- 0. SECURITY-DEFINER HELPERS (break RLS recursion)
-- ------------------------------------------------------------
create or replace function public.is_manuscript_owner(p_manuscript_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1 from public.manuscripts m
        where m.id = p_manuscript_id
          and m.submitted_by = auth.uid()
    );
$$;

create or replace function public.is_manuscript_author(p_manuscript_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1 from public.manuscripts m
        where m.id = p_manuscript_id
          and (
              m.submitted_by = auth.uid()
              or exists (
                  select 1 from public.manuscript_authors ma
                  where ma.manuscript_id = m.id
                    and ma.user_id = auth.uid()
              )
          )
    );
$$;

-- Reviewer helpers: resolve the reviewer_profiles row for the current user
-- and the manuscript id for a given round, RLS-bypassing to avoid recursion.
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

-- ------------------------------------------------------------
-- PROFILES: allow a user to create their own profile row
-- ------------------------------------------------------------
drop policy if exists "users can create own profile" on public.profiles;
create policy "users can create own profile"
on public.profiles
for insert
to authenticated
with check (id = auth.uid());

-- ------------------------------------------------------------
-- INSTITUTIONS: shared reference table
-- ------------------------------------------------------------
drop policy if exists "authenticated users can view institutions" on public.institutions;
create policy "authenticated users can view institutions"
on public.institutions
for select
to authenticated
using (true);

drop policy if exists "authenticated users can create institutions" on public.institutions;
create policy "authenticated users can create institutions"
on public.institutions
for insert
to authenticated
with check (true);

-- ------------------------------------------------------------
-- AUTHOR PROFILES: own-row access
-- ------------------------------------------------------------
drop policy if exists "users can view own author profile" on public.author_profiles;
create policy "users can view own author profile"
on public.author_profiles
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "users can create own author profile" on public.author_profiles;
create policy "users can create own author profile"
on public.author_profiles
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "users can update own author profile" on public.author_profiles;
create policy "users can update own author profile"
on public.author_profiles
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- ------------------------------------------------------------
-- REVIEWER PROFILES: own-row access
-- ------------------------------------------------------------
drop policy if exists "users can view own reviewer profile" on public.reviewer_profiles;
create policy "users can view own reviewer profile"
on public.reviewer_profiles
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "users can create own reviewer profile" on public.reviewer_profiles;
create policy "users can create own reviewer profile"
on public.reviewer_profiles
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "users can update own reviewer profile" on public.reviewer_profiles;
create policy "users can update own reviewer profile"
on public.reviewer_profiles
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- ------------------------------------------------------------
-- MANUSCRIPT_AUTHORS
-- ------------------------------------------------------------
drop policy if exists "authors can view manuscript authors" on public.manuscript_authors;
create policy "authors can view manuscript authors"
on public.manuscript_authors
for select
to authenticated
using (public.is_manuscript_author(manuscript_authors.manuscript_id));

drop policy if exists "authors can manage manuscript authors" on public.manuscript_authors;
create policy "authors can manage manuscript authors"
on public.manuscript_authors
for insert
to authenticated
with check (public.is_manuscript_owner(manuscript_authors.manuscript_id));

drop policy if exists "authors can update manuscript authors" on public.manuscript_authors;
create policy "authors can update manuscript authors"
on public.manuscript_authors
for update
to authenticated
using (public.is_manuscript_author(manuscript_authors.manuscript_id))
with check (public.is_manuscript_author(manuscript_authors.manuscript_id));

drop policy if exists "authors can delete manuscript authors" on public.manuscript_authors;
create policy "authors can delete manuscript authors"
on public.manuscript_authors
for delete
to authenticated
using (public.is_manuscript_author(manuscript_authors.manuscript_id));

-- ------------------------------------------------------------
-- MANUSCRIPT_VERSIONS
-- ------------------------------------------------------------
drop policy if exists "authors can view manuscript versions" on public.manuscript_versions;
create policy "authors can view manuscript versions"
on public.manuscript_versions
for select
to authenticated
using (public.is_manuscript_owner(manuscript_versions.manuscript_id));

drop policy if exists "authors can create manuscript versions" on public.manuscript_versions;
create policy "authors can create manuscript versions"
on public.manuscript_versions
for insert
to authenticated
with check (public.is_manuscript_owner(manuscript_versions.manuscript_id));

-- ------------------------------------------------------------
-- MANUSCRIPT_FILES
-- ------------------------------------------------------------
drop policy if exists "authors can view manuscript files" on public.manuscript_files;
create policy "authors can view manuscript files"
on public.manuscript_files
for select
to authenticated
using (public.is_manuscript_owner(manuscript_files.manuscript_id));

drop policy if exists "authors can upload manuscript files" on public.manuscript_files;
create policy "authors can upload manuscript files"
on public.manuscript_files
for insert
to authenticated
with check (public.is_manuscript_owner(manuscript_files.manuscript_id));

drop policy if exists "authors can update manuscript files" on public.manuscript_files;
create policy "authors can update manuscript files"
on public.manuscript_files
for update
to authenticated
using (public.is_manuscript_owner(manuscript_files.manuscript_id))
with check (public.is_manuscript_owner(manuscript_files.manuscript_id));

drop policy if exists "authors can delete manuscript files" on public.manuscript_files;
create policy "authors can delete manuscript files"
on public.manuscript_files
for delete
to authenticated
using (public.is_manuscript_owner(manuscript_files.manuscript_id));

-- ------------------------------------------------------------
-- SUBMISSION_DECLARATIONS
-- ------------------------------------------------------------
drop policy if exists "authors can view declarations" on public.submission_declarations;
create policy "authors can view declarations"
on public.submission_declarations
for select
to authenticated
using (public.is_manuscript_owner(submission_declarations.manuscript_id));

drop policy if exists "authors can manage declarations" on public.submission_declarations;
create policy "authors can manage declarations"
on public.submission_declarations
for insert
to authenticated
with check (public.is_manuscript_owner(submission_declarations.manuscript_id));

drop policy if exists "authors can update declarations" on public.submission_declarations;
create policy "authors can update declarations"
on public.submission_declarations
for update
to authenticated
using (public.is_manuscript_owner(submission_declarations.manuscript_id))
with check (public.is_manuscript_owner(submission_declarations.manuscript_id));

-- ------------------------------------------------------------
-- MANUSCRIPT_REVIEWER_SUGGESTIONS
-- ------------------------------------------------------------
drop policy if exists "authors can view suggested reviewers" on public.manuscript_reviewer_suggestions;
create policy "authors can view suggested reviewers"
on public.manuscript_reviewer_suggestions
for select
to authenticated
using (public.is_manuscript_owner(manuscript_reviewer_suggestions.manuscript_id));

drop policy if exists "authors can manage suggested reviewers" on public.manuscript_reviewer_suggestions;
create policy "authors can manage suggested reviewers"
on public.manuscript_reviewer_suggestions
for insert
to authenticated
with check (public.is_manuscript_owner(manuscript_reviewer_suggestions.manuscript_id));

-- ------------------------------------------------------------
-- MANUSCRIPT_EXCLUDED_REVIEWERS
-- ------------------------------------------------------------
drop policy if exists "authors can view excluded reviewers" on public.manuscript_excluded_reviewers;
create policy "authors can view excluded reviewers"
on public.manuscript_excluded_reviewers
for select
to authenticated
using (public.is_manuscript_owner(manuscript_excluded_reviewers.manuscript_id));

drop policy if exists "authors can manage excluded reviewers" on public.manuscript_excluded_reviewers;
create policy "authors can manage excluded reviewers"
on public.manuscript_excluded_reviewers
for insert
to authenticated
with check (public.is_manuscript_owner(manuscript_excluded_reviewers.manuscript_id));

-- ------------------------------------------------------------
-- WORKFLOW_EVENTS: authors can read their own manuscript events
-- ------------------------------------------------------------
drop policy if exists "authors can view workflow events" on public.workflow_events;
create policy "authors can view workflow events"
on public.workflow_events
for select
to authenticated
using (public.is_manuscript_owner(workflow_events.manuscript_id));

-- ------------------------------------------------------------
-- REVIEWER ACCESS: reviewers see their own assignments,
-- invitations, the linked review rounds and manuscript details.
-- ------------------------------------------------------------
drop policy if exists "reviewers see own assignments" on public.review_assignments;
create policy "reviewers see own assignments"
on public.review_assignments
for select
to authenticated
using (reviewer_id = public.current_reviewer_id());

drop policy if exists "reviewers can update own assignments" on public.review_assignments;
create policy "reviewers can update own assignments"
on public.review_assignments
for update
to authenticated
using (reviewer_id = public.current_reviewer_id())
with check (reviewer_id = public.current_reviewer_id());

drop policy if exists "reviewers see own invitations" on public.reviewer_invitations;
create policy "reviewers see own invitations"
on public.reviewer_invitations
for select
to authenticated
using (reviewer_id = public.current_reviewer_id());

drop policy if exists "reviewers can update own invitations" on public.reviewer_invitations;
create policy "reviewers can update own invitations"
on public.reviewer_invitations
for update
to authenticated
using (reviewer_id = public.current_reviewer_id())
with check (reviewer_id = public.current_reviewer_id());

-- Review rounds visible to anyone assigned to the round
drop policy if exists "reviewers see assigned rounds" on public.review_rounds;
create policy "reviewers see assigned rounds"
on public.review_rounds
for select
to authenticated
using (public.is_assigned_reviewer(review_rounds.id));

-- Manuscripts visible to reviewers assigned to any of its rounds
drop policy if exists "reviewers see assigned manuscripts" on public.manuscripts;
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

-- Review reports visible to the reviewer who wrote them
drop policy if exists "reviewers see own reports" on public.review_reports;
create policy "reviewers see own reports"
on public.review_reports
for select
to authenticated
using (
    exists (
        select 1
        from public.review_assignments ra
        where ra.id = review_reports.review_assignment_id
          and ra.reviewer_id = public.current_reviewer_id()
    )
);

drop policy if exists "reviewers manage own review reports" on public.review_reports;
create policy "reviewers manage own review reports"
on public.review_reports
for all
to authenticated
using (
    exists (
        select 1
        from public.review_assignments ra
        where ra.id = review_reports.review_assignment_id
          and ra.reviewer_id = public.current_reviewer_id()
    )
)
with check (
    exists (
        select 1
        from public.review_assignments ra
        where ra.id = review_reports.review_assignment_id
          and ra.reviewer_id = public.current_reviewer_id()
    )
);

-- ------------------------------------------------------------
-- DONE
-- ------------------------------------------------------------
select 'RLS policies applied successfully' as status;
