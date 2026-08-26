-- ============================================================
-- Migration: 20260825_fix_rls
-- Fixes missing RLS policies for manuscript-related and finance
-- tables that had RLS enabled but no policies, causing anon client
-- queries to return empty. Idempotent — safe to re-run.
-- Also ensures editorial/reviewer/finance/production roles can
-- access related tables via existing helpers.
-- ============================================================
-- Helpers (re-create to ensure existence, security definer to bypass RLS)
create or replace function public.is_super_admin()
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.journal_members jm where jm.user_id = auth.uid() and jm.role = 'super_admin' and jm.is_active = true); $$;

create or replace function public.is_journal_member(p_journal_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.journal_members jm where jm.journal_id = p_journal_id and jm.user_id = auth.uid() and jm.is_active = true); $$;

create or replace function public.has_journal_role(p_journal_id uuid, p_roles public.user_role[])
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.journal_members jm where jm.journal_id = p_journal_id and jm.user_id = auth.uid() and jm.is_active = true and jm.role = any(p_roles)); $$;

create or replace function public.is_manuscript_owner(p_manuscript_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.manuscripts m where m.id = p_manuscript_id and m.submitted_by = auth.uid()); $$;

create or replace function public.is_manuscript_author(p_manuscript_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.manuscripts m where m.id = p_manuscript_id and (m.submitted_by = auth.uid() or exists (select 1 from public.manuscript_authors ma where ma.manuscript_id = m.id and ma.user_id = auth.uid()))); $$;

create or replace function public.current_reviewer_id()
returns uuid language sql stable security definer set search_path = public
as $$ select rp.id from public.reviewer_profiles rp where rp.user_id = auth.uid() limit 1; $$;

create or replace function public.is_assigned_reviewer(p_round_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.review_assignments ra where ra.review_round_id = p_round_id and ra.reviewer_id = public.current_reviewer_id()); $$;

create or replace function public.is_editorial(p_journal_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select public.has_journal_role(p_journal_id, array['editor'::public.user_role,'section_editor'::public.user_role,'editor_in_chief'::public.user_role,'managing_editor'::public.user_role,'journal_manager'::public.user_role,'journal_admin'::public.user_role,'super_admin'::public.user_role]); $$;

create or replace function public.is_production(p_journal_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select public.has_journal_role(p_journal_id, array['copyeditor'::public.user_role,'production_editor'::public.user_role,'managing_editor'::public.user_role,'journal_manager'::public.user_role,'journal_admin'::public.user_role,'super_admin'::public.user_role]); $$;

create or replace function public.is_finance(p_journal_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select public.has_journal_role(p_journal_id, array['finance_admin'::public.user_role,'journal_manager'::public.user_role,'journal_admin'::public.user_role,'super_admin'::public.user_role]); $$;

create or replace function public.is_admin(p_journal_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select public.has_journal_role(p_journal_id, array['journal_manager'::public.user_role,'journal_admin'::public.user_role,'super_admin'::public.user_role]); $$;

create or replace function public.manuscript_journal(p_manuscript_id uuid)
returns uuid language sql stable security definer set search_path = public
as $$ select m.journal_id from public.manuscripts m where m.id = p_manuscript_id; $$;

create or replace function public.article_journal(p_article_id uuid)
returns uuid language sql stable security definer set search_path = public
as $$ select a.journal_id from public.articles a where a.id = p_article_id; $$;

create or replace function public.assignment_manuscript(p_assignment_id uuid)
returns uuid language sql stable security definer set search_path = public
as $$ select rr.manuscript_id from public.review_assignments ra join public.review_rounds rr on rr.id = ra.review_round_id where ra.id = p_assignment_id; $$;

-- ============================================================
-- PROFILES / INSTITUTIONS / AUTHOR & REVIEWER PROFILES
-- ============================================================
drop policy if exists "users can view own profile" on public.profiles;
create policy "users can view own profile" on public.profiles for select to authenticated using (id = auth.uid());
drop policy if exists "users can update own profile" on public.profiles;
create policy "users can update own profile" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
drop policy if exists "users can create own profile" on public.profiles;
create policy "users can create own profile" on public.profiles for insert to authenticated with check (id = auth.uid());
drop policy if exists "admins can view any profile" on public.profiles;
create policy "admins can view any profile" on public.profiles for select to authenticated using (public.is_super_admin());

drop policy if exists "authenticated users can view institutions" on public.institutions;
create policy "authenticated users can view institutions" on public.institutions for select to authenticated using (true);
drop policy if exists "authenticated users can create institutions" on public.institutions;
create policy "authenticated users can create institutions" on public.institutions for insert to authenticated with check (true);

drop policy if exists "users can view own author profile" on public.author_profiles;
create policy "users can view own author profile" on public.author_profiles for select to authenticated using (user_id = auth.uid());
drop policy if exists "users can create own author profile" on public.author_profiles;
create policy "users can create own author profile" on public.author_profiles for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "users can update own author profile" on public.author_profiles;
create policy "users can update own author profile" on public.author_profiles for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "users can view own reviewer profile" on public.reviewer_profiles;
create policy "users can view own reviewer profile" on public.reviewer_profiles for select to authenticated using (user_id = auth.uid());
drop policy if exists "users can create own reviewer profile" on public.reviewer_profiles;
create policy "users can create own reviewer profile" on public.reviewer_profiles for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "users can update own reviewer profile" on public.reviewer_profiles;
create policy "users can update own reviewer profile" on public.reviewer_profiles for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "editorial can view reviewer profiles" on public.reviewer_profiles;
create policy "editorial can view reviewer profiles" on public.reviewer_profiles for select to authenticated using (public.is_super_admin() or exists (select 1 from public.journal_members jm where jm.user_id = auth.uid() and jm.is_active = true and jm.role in ('editor','section_editor','editor_in_chief','managing_editor','journal_manager','journal_admin')));

-- ============================================================
-- JOURNALS / JOURNAL_MEMBERS
-- ============================================================
drop policy if exists "active journals publicly visible" on public.journals;
create policy "active journals publicly visible" on public.journals for select to anon, authenticated using (status = 'active');
drop policy if exists "journal members can view journal" on public.journals;
create policy "journal members can view journal" on public.journals for select to authenticated using (public.is_journal_member(id));
drop policy if exists "journal admins manage journals" on public.journals;
create policy "journal admins manage journals" on public.journals for all to authenticated using (public.is_admin(id)) with check (public.is_admin(id));

drop policy if exists "users view own memberships" on public.journal_members;
create policy "users view own memberships" on public.journal_members for select to authenticated using (user_id = auth.uid());
drop policy if exists "admins manage journal members" on public.journal_members;
create policy "admins manage journal members" on public.journal_members for all to authenticated using (public.is_admin(journal_id)) with check (public.is_admin(journal_id));

-- ============================================================
-- MANUSCRIPTS (author / reviewer / editorial / production / finance)
-- ============================================================
drop policy if exists "authors can view their manuscripts" on public.manuscripts;
create policy "authors can view their manuscripts" on public.manuscripts for select to authenticated using (public.is_manuscript_author(manuscripts.id));
drop policy if exists "reviewers see assigned manuscripts" on public.manuscripts;
create policy "reviewers see assigned manuscripts" on public.manuscripts for select to authenticated using (exists (select 1 from public.review_rounds rr where rr.manuscript_id = manuscripts.id and public.is_assigned_reviewer(rr.id)));
drop policy if exists "accepted manuscripts publicly visible" on public.manuscripts;
create policy "accepted manuscripts publicly visible" on public.manuscripts for select to anon, authenticated using (status in ('accepted','ready_to_publish'));
drop policy if exists "editors can view journal manuscripts" on public.manuscripts;
create policy "editors can view journal manuscripts" on public.manuscripts for select to authenticated using (public.is_editorial(journal_id));
drop policy if exists "authors can create manuscripts" on public.manuscripts;
create policy "authors can create manuscripts" on public.manuscripts for insert to authenticated with check (submitted_by = auth.uid());
drop policy if exists "authors can update draft manuscripts" on public.manuscripts;
create policy "authors can update draft manuscripts" on public.manuscripts for update to authenticated using (submitted_by = auth.uid() and status in ('draft','returned_to_author','minor_revision','major_revision','revision_submitted')) with check (submitted_by = auth.uid());
drop policy if exists "editors can update journal manuscripts" on public.manuscripts;
create policy "editors can update journal manuscripts" on public.manuscripts for update to authenticated using (public.is_editorial(journal_id)) with check (public.is_editorial(journal_id));
drop policy if exists "production can view journal manuscripts" on public.manuscripts;
create policy "production can view journal manuscripts" on public.manuscripts for select to authenticated using (public.is_production(journal_id) or public.is_finance(journal_id));

-- ============================================================
-- MANUSCRIPT AUTHORS / VERSIONS / FILES / DECLARATIONS
-- ============================================================
drop policy if exists "authors can view manuscript authors" on public.manuscript_authors;
create policy "authors can view manuscript authors" on public.manuscript_authors for select to authenticated using (public.is_manuscript_author(manuscript_authors.manuscript_id) or public.is_editorial(public.manuscript_journal(manuscript_authors.manuscript_id)));
drop policy if exists "authors can manage manuscript authors" on public.manuscript_authors;
create policy "authors can manage manuscript authors" on public.manuscript_authors for insert to authenticated with check (public.is_manuscript_owner(manuscript_authors.manuscript_id));
drop policy if exists "authors can update manuscript authors" on public.manuscript_authors;
create policy "authors can update manuscript authors" on public.manuscript_authors for update to authenticated using (public.is_manuscript_owner(manuscript_authors.manuscript_id)) with check (public.is_manuscript_owner(manuscript_authors.manuscript_id));
drop policy if exists "authors can delete manuscript authors" on public.manuscript_authors;
create policy "authors can delete manuscript authors" on public.manuscript_authors for delete to authenticated using (public.is_manuscript_owner(manuscript_authors.manuscript_id));

drop policy if exists "authors can view manuscript versions" on public.manuscript_versions;
create policy "authors can view manuscript versions" on public.manuscript_versions for select to authenticated using (public.is_manuscript_owner(manuscript_versions.manuscript_id) or public.is_manuscript_author(manuscript_versions.manuscript_id) or public.is_editorial(public.manuscript_journal(manuscript_versions.manuscript_id)) or public.is_production(public.manuscript_journal(manuscript_versions.manuscript_id)));
drop policy if exists "authors can create manuscript versions" on public.manuscript_versions;
create policy "authors can create manuscript versions" on public.manuscript_versions for insert to authenticated with check (public.is_manuscript_owner(manuscript_versions.manuscript_id));

drop policy if exists "authors can view manuscript files" on public.manuscript_files;
create policy "authors can view manuscript files" on public.manuscript_files for select to authenticated using (public.is_manuscript_owner(manuscript_files.manuscript_id) or public.is_manuscript_author(manuscript_files.manuscript_id) or public.is_editorial(public.manuscript_journal(manuscript_files.manuscript_id)) or public.is_production(public.manuscript_journal(manuscript_files.manuscript_id)));
drop policy if exists "authors can upload manuscript files" on public.manuscript_files;
create policy "authors can upload manuscript files" on public.manuscript_files for insert to authenticated with check (public.is_manuscript_owner(manuscript_files.manuscript_id));
drop policy if exists "authors can update manuscript files" on public.manuscript_files;
create policy "authors can update manuscript files" on public.manuscript_files for update to authenticated using (public.is_manuscript_owner(manuscript_files.manuscript_id)) with check (public.is_manuscript_owner(manuscript_files.manuscript_id));
drop policy if exists "authors can delete manuscript files" on public.manuscript_files;
create policy "authors can delete manuscript files" on public.manuscript_files for delete to authenticated using (public.is_manuscript_owner(manuscript_files.manuscript_id));

drop policy if exists "authors can view declarations" on public.submission_declarations;
create policy "authors can view declarations" on public.submission_declarations for select to authenticated using (public.is_manuscript_owner(submission_declarations.manuscript_id) or public.is_manuscript_author(submission_declarations.manuscript_id) or public.is_editorial(public.manuscript_journal(submission_declarations.manuscript_id)));
drop policy if exists "authors can manage declarations" on public.submission_declarations;
create policy "authors can manage declarations" on public.submission_declarations for insert to authenticated with check (public.is_manuscript_owner(submission_declarations.manuscript_id));
drop policy if exists "authors can update declarations" on public.submission_declarations;
create policy "authors can update declarations" on public.submission_declarations for update to authenticated using (public.is_manuscript_owner(submission_declarations.manuscript_id)) with check (public.is_manuscript_owner(submission_declarations.manuscript_id));

drop policy if exists "authors can view suggested reviewers" on public.manuscript_reviewer_suggestions;
create policy "authors can view suggested reviewers" on public.manuscript_reviewer_suggestions for select to authenticated using (public.is_manuscript_owner(manuscript_reviewer_suggestions.manuscript_id) or public.is_editorial(public.manuscript_journal(manuscript_reviewer_suggestions.manuscript_id)));
drop policy if exists "authors can manage suggested reviewers" on public.manuscript_reviewer_suggestions;
create policy "authors can manage suggested reviewers" on public.manuscript_reviewer_suggestions for insert to authenticated with check (public.is_manuscript_owner(manuscript_reviewer_suggestions.manuscript_id));

drop policy if exists "authors can view excluded reviewers" on public.manuscript_excluded_reviewers;
create policy "authors can view excluded reviewers" on public.manuscript_excluded_reviewers for select to authenticated using (public.is_manuscript_owner(manuscript_excluded_reviewers.manuscript_id) or public.is_editorial(public.manuscript_journal(manuscript_excluded_reviewers.manuscript_id)));
drop policy if exists "authors can manage excluded reviewers" on public.manuscript_excluded_reviewers;
create policy "authors can manage excluded reviewers" on public.manuscript_excluded_reviewers for insert to authenticated with check (public.is_manuscript_owner(manuscript_excluded_reviewers.manuscript_id));

-- ============================================================
-- EDITORIAL ASSIGNMENTS / REVIEW ROUNDS / INVITATIONS / ASSIGNMENTS
-- ============================================================
drop policy if exists "editorial can view assignments" on public.editorial_assignments;
create policy "editorial can view assignments" on public.editorial_assignments for select to authenticated using (public.is_editorial(public.manuscript_journal(editorial_assignments.manuscript_id)));
drop policy if exists "editorial can create assignments" on public.editorial_assignments;
create policy "editorial can create assignments" on public.editorial_assignments for insert to authenticated with check (public.is_editorial(public.manuscript_journal(editorial_assignments.manuscript_id)));
drop policy if exists "editorial can update assignments" on public.editorial_assignments;
create policy "editorial can update assignments" on public.editorial_assignments for update to authenticated using (public.is_editorial(public.manuscript_journal(editorial_assignments.manuscript_id))) with check (public.is_editorial(public.manuscript_journal(editorial_assignments.manuscript_id)));

drop policy if exists "reviewers see assigned rounds" on public.review_rounds;
create policy "reviewers see assigned rounds" on public.review_rounds for select to authenticated using (public.is_assigned_reviewer(review_rounds.id));
drop policy if exists "editorial can view rounds" on public.review_rounds;
create policy "editorial can view rounds" on public.review_rounds for select to authenticated using (public.is_editorial(public.manuscript_journal(review_rounds.manuscript_id)));
drop policy if exists "editorial can create rounds" on public.review_rounds;
create policy "editorial can create rounds" on public.review_rounds for insert to authenticated with check (public.is_editorial(public.manuscript_journal(review_rounds.manuscript_id)));
drop policy if exists "editorial can update rounds" on public.review_rounds;
create policy "editorial can update rounds" on public.review_rounds for update to authenticated using (public.is_editorial(public.manuscript_journal(review_rounds.manuscript_id))) with check (public.is_editorial(public.manuscript_journal(review_rounds.manuscript_id)));

drop policy if exists "reviewers see own invitations" on public.reviewer_invitations;
create policy "reviewers see own invitations" on public.reviewer_invitations for select to authenticated using (reviewer_id = public.current_reviewer_id());
drop policy if exists "reviewers can update own invitations" on public.reviewer_invitations;
create policy "reviewers can update own invitations" on public.reviewer_invitations for update to authenticated using (reviewer_id = public.current_reviewer_id()) with check (reviewer_id = public.current_reviewer_id());
drop policy if exists "editorial can view invitations" on public.reviewer_invitations;
create policy "editorial can view invitations" on public.reviewer_invitations for select to authenticated using (public.is_editorial(public.manuscript_journal((select rr.manuscript_id from public.review_rounds rr where rr.id = reviewer_invitations.review_round_id))));
drop policy if exists "editorial can create invitations" on public.reviewer_invitations;
create policy "editorial can create invitations" on public.reviewer_invitations for insert to authenticated with check (public.is_editorial(public.manuscript_journal((select rr.manuscript_id from public.review_rounds rr where rr.id = reviewer_invitations.review_round_id))));

drop policy if exists "reviewers see own assignments" on public.review_assignments;
create policy "reviewers see own assignments" on public.review_assignments for select to authenticated using (reviewer_id = public.current_reviewer_id());
drop policy if exists "reviewers can update own assignments" on public.review_assignments;
create policy "reviewers can update own assignments" on public.review_assignments for update to authenticated using (reviewer_id = public.current_reviewer_id()) with check (reviewer_id = public.current_reviewer_id());
drop policy if exists "editorial can view assignments" on public.review_assignments;
create policy "editorial can view assignments" on public.review_assignments for select to authenticated using (public.is_editorial(public.manuscript_journal((select rr.manuscript_id from public.review_rounds rr where rr.id = review_assignments.review_round_id))));
drop policy if exists "editorial can create assignments" on public.review_assignments;
create policy "editorial can create assignments" on public.review_assignments for insert to authenticated with check (public.is_editorial(public.manuscript_journal((select rr.manuscript_id from public.review_rounds rr where rr.id = review_assignments.review_round_id))));
drop policy if exists "editorial can update assignments" on public.review_assignments;
create policy "editorial can update assignments" on public.review_assignments for update to authenticated using (public.is_editorial(public.manuscript_journal((select rr.manuscript_id from public.review_rounds rr where rr.id = review_assignments.review_round_id)))) with check (public.is_editorial(public.manuscript_journal((select rr.manuscript_id from public.review_rounds rr where rr.id = review_assignments.review_round_id))));

-- ============================================================
-- REVIEW REPORTS / COMMENTS / ANNOTATIONS
-- ============================================================
drop policy if exists "reviewers manage own review reports" on public.review_reports;
create policy "reviewers manage own review reports" on public.review_reports for all to authenticated using (exists (select 1 from public.review_assignments ra where ra.id = review_reports.review_assignment_id and ra.reviewer_id = public.current_reviewer_id())) with check (exists (select 1 from public.review_assignments ra where ra.id = review_reports.review_assignment_id and ra.reviewer_id = public.current_reviewer_id()));
drop policy if exists "editorial can view review reports" on public.review_reports;
create policy "editorial can view review reports" on public.review_reports for select to authenticated using (public.is_editorial(public.manuscript_journal(public.assignment_manuscript(review_reports.review_assignment_id))));

drop policy if exists "reviewers manage own review comments" on public.review_comments;
create policy "reviewers manage own review comments" on public.review_comments for all to authenticated using (exists (select 1 from public.review_reports rr join public.review_assignments ra on ra.id = rr.review_assignment_id where rr.id = review_comments.review_report_id and ra.reviewer_id = public.current_reviewer_id())) with check (exists (select 1 from public.review_reports rr join public.review_assignments ra on ra.id = rr.review_assignment_id where rr.id = review_comments.review_report_id and ra.reviewer_id = public.current_reviewer_id()));
drop policy if exists "editorial can view review comments" on public.review_comments;
create policy "editorial can view review comments" on public.review_comments for select to authenticated using (public.is_editorial(public.manuscript_journal((select rr.manuscript_id from public.review_reports rp2 join public.review_assignments ra on ra.id = rp2.review_assignment_id join public.review_rounds rr on rr.id = ra.review_round_id where rp2.id = review_comments.review_report_id))));
drop policy if exists "authors can view review comments" on public.review_comments;
create policy "authors can view review comments" on public.review_comments for select to authenticated using (public.is_manuscript_author((select rr.manuscript_id from public.review_reports rp2 join public.review_assignments ra on ra.id = rp2.review_assignment_id join public.review_rounds rr on rr.id = ra.review_round_id where rp2.id = review_comments.review_report_id)));

drop policy if exists "reviewers manage own annotations" on public.review_annotations;
create policy "reviewers manage own annotations" on public.review_annotations for all to authenticated using (exists (select 1 from public.review_assignments ra where ra.id = review_annotations.review_assignment_id and ra.reviewer_id = public.current_reviewer_id())) with check (exists (select 1 from public.review_assignments ra where ra.id = review_annotations.review_assignment_id and ra.reviewer_id = public.current_reviewer_id()));
drop policy if exists "editorial can view annotations" on public.review_annotations;
create policy "editorial can view annotations" on public.review_annotations for select to authenticated using (public.is_editorial(public.manuscript_journal(public.assignment_manuscript(review_annotations.review_assignment_id))));

-- ============================================================
-- EDITORIAL DECISIONS / REVISION REQUESTS / AUTHOR RESPONSES
-- ============================================================
drop policy if exists "editorial can view decisions" on public.editorial_decisions;
create policy "editorial can view decisions" on public.editorial_decisions for select to authenticated using (public.is_editorial(public.manuscript_journal(editorial_decisions.manuscript_id)));
drop policy if exists "editorial can create decisions" on public.editorial_decisions;
create policy "editorial can create decisions" on public.editorial_decisions for insert to authenticated with check (public.is_editorial(public.manuscript_journal(editorial_decisions.manuscript_id)));
drop policy if exists "editorial can update decisions" on public.editorial_decisions;
create policy "editorial can update decisions" on public.editorial_decisions for update to authenticated using (public.is_editorial(public.manuscript_journal(editorial_decisions.manuscript_id))) with check (public.is_editorial(public.manuscript_journal(editorial_decisions.manuscript_id)));
drop policy if exists "authors can view decisions" on public.editorial_decisions;
create policy "authors can view decisions" on public.editorial_decisions for select to authenticated using (public.is_manuscript_author(editorial_decisions.manuscript_id));

drop policy if exists "editorial can manage revision requests" on public.revision_requests;
create policy "editorial can manage revision requests" on public.revision_requests for all to authenticated using (public.is_editorial(public.manuscript_journal(revision_requests.manuscript_id))) with check (public.is_editorial(public.manuscript_journal(revision_requests.manuscript_id)));
drop policy if exists "authors can view revision requests" on public.revision_requests;
create policy "authors can view revision requests" on public.revision_requests for select to authenticated using (public.is_manuscript_author(revision_requests.manuscript_id));

drop policy if exists "authors can manage responses" on public.author_responses;
create policy "authors can manage responses" on public.author_responses for all to authenticated using (public.is_manuscript_author((select rev.manuscript_id from public.revision_requests rev where rev.id = author_responses.revision_request_id))) with check (public.is_manuscript_author((select rev.manuscript_id from public.revision_requests rev where rev.id = author_responses.revision_request_id)));
drop policy if exists "editorial can view responses" on public.author_responses;
create policy "editorial can view responses" on public.author_responses for select to authenticated using (public.is_editorial(public.manuscript_journal((select rev.manuscript_id from public.revision_requests rev where rev.id = author_responses.revision_request_id))));

-- ============================================================
-- WORKFLOW EVENTS
-- ============================================================
drop policy if exists "authors can view workflow events" on public.workflow_events;
create policy "authors can view workflow events" on public.workflow_events for select to authenticated using (public.is_manuscript_author(workflow_events.manuscript_id));
drop policy if exists "editorial can view workflow events" on public.workflow_events;
create policy "editorial can view workflow events" on public.workflow_events for select to authenticated using (public.is_editorial(public.manuscript_journal(workflow_events.manuscript_id)));
drop policy if exists "editorial can create workflow events" on public.workflow_events;
create policy "editorial can create workflow events" on public.workflow_events for insert to authenticated with check (public.is_editorial(public.manuscript_journal(workflow_events.manuscript_id)));
drop policy if exists "authors can create workflow events" on public.workflow_events;
create policy "authors can create workflow events" on public.workflow_events for insert to authenticated with check (public.is_manuscript_owner(workflow_events.manuscript_id));

-- ============================================================
-- APC / WAIVERS / INVOICES / PAYMENTS
-- ============================================================
drop policy if exists "authors can view own apc" on public.apcs;
create policy "authors can view own apc" on public.apcs for select to authenticated using (public.is_manuscript_author(apcs.manuscript_id));
drop policy if exists "finance can view apcs" on public.apcs;
create policy "finance can view apcs" on public.apcs for select to authenticated using (public.is_finance(public.manuscript_journal(apcs.manuscript_id)));
drop policy if exists "finance can manage apcs" on public.apcs;
create policy "finance can manage apcs" on public.apcs for all to authenticated using (public.is_finance(public.manuscript_journal(apcs.manuscript_id))) with check (public.is_finance(public.manuscript_journal(apcs.manuscript_id)));

drop policy if exists "authors can view own waivers" on public.apc_waivers;
create policy "authors can view own waivers" on public.apc_waivers for select to authenticated using (public.is_manuscript_author((select a.manuscript_id from public.apcs a where a.id = apc_waivers.apc_id)));
drop policy if exists "authors can request waivers" on public.apc_waivers;
create policy "authors can request waivers" on public.apc_waivers for insert to authenticated with check (requested_by = auth.uid() and public.is_manuscript_author((select a.manuscript_id from public.apcs a where a.id = apc_waivers.apc_id)));
drop policy if exists "finance can manage waivers" on public.apc_waivers;
create policy "finance can manage waivers" on public.apc_waivers for all to authenticated using (public.is_finance(public.manuscript_journal((select a.manuscript_id from public.apcs a where a.id = apc_waivers.apc_id)))) with check (public.is_finance(public.manuscript_journal((select a.manuscript_id from public.apcs a where a.id = apc_waivers.apc_id))));

drop policy if exists "authors can view own invoices" on public.invoices;
create policy "authors can view own invoices" on public.invoices for select to authenticated using (public.is_manuscript_author((select a.manuscript_id from public.apcs a where a.id = invoices.apc_id)));
drop policy if exists "finance can view invoices" on public.invoices;
create policy "finance can view invoices" on public.invoices for select to authenticated using (public.is_finance(public.manuscript_journal((select a.manuscript_id from public.apcs a where a.id = invoices.apc_id))));
drop policy if exists "finance can manage invoices" on public.invoices;
create policy "finance can manage invoices" on public.invoices for all to authenticated using (public.is_finance(public.manuscript_journal((select a.manuscript_id from public.apcs a where a.id = invoices.apc_id)))) with check (public.is_finance(public.manuscript_journal((select a.manuscript_id from public.apcs a where a.id = invoices.apc_id))));

drop policy if exists "finance can view payments" on public.payments;
create policy "finance can view payments" on public.payments for select to authenticated using (public.is_finance(public.manuscript_journal((select a.manuscript_id from public.invoices i join public.apcs a on a.id = i.apc_id where i.id = payments.invoice_id))));
drop policy if exists "finance can manage payments" on public.payments;
create policy "finance can manage payments" on public.payments for all to authenticated using (public.is_finance(public.manuscript_journal((select a.manuscript_id from public.invoices i join public.apcs a on a.id = i.apc_id where i.id = payments.invoice_id)))) with check (public.is_finance(public.manuscript_journal((select a.manuscript_id from public.invoices i join public.apcs a on a.id = i.apc_id where i.id = payments.invoice_id))));

-- ============================================================
-- PUBLIC TABLES (volumes/issues/articles) - ensure public read, editorial manage
-- ============================================================
drop policy if exists "published volumes publicly visible" on public.volumes;
create policy "published volumes publicly visible" on public.volumes for select to anon, authenticated using (published_at is not null);
drop policy if exists "editorial can manage volumes" on public.volumes;
create policy "editorial can manage volumes" on public.volumes for all to authenticated using (public.is_editorial(volumes.journal_id)) with check (public.is_editorial(volumes.journal_id));

drop policy if exists "published issues publicly visible" on public.issues;
create policy "published issues publicly visible" on public.issues for select to anon, authenticated using (publication_date is not null);
drop policy if exists "editorial can manage issues" on public.issues;
create policy "editorial can manage issues" on public.issues for all to authenticated using (public.is_editorial(issues.journal_id)) with check (public.is_editorial(issues.journal_id));

drop policy if exists "published articles publicly visible" on public.articles;
create policy "published articles publicly visible" on public.articles for select to anon, authenticated using (publication_status in ('early_access','published','corrected'));
drop policy if exists "editorial can view journal articles" on public.articles;
create policy "editorial can view journal articles" on public.articles for select to authenticated using (public.is_editorial(journal_id) or public.is_production(journal_id));
drop policy if exists "editorial can create articles" on public.articles;
create policy "editorial can create articles" on public.articles for insert to authenticated with check (public.is_editorial(journal_id) or public.is_production(journal_id));
drop policy if exists "editorial can update articles" on public.articles;
create policy "editorial can update articles" on public.articles for update to authenticated using (public.is_editorial(journal_id) or public.is_production(journal_id)) with check (public.is_editorial(journal_id) or public.is_production(journal_id));
drop policy if exists "authors can view own articles" on public.articles;
create policy "authors can view own articles" on public.articles for select to authenticated using (public.is_manuscript_author(manuscript_id));

-- Article authors / versions / production / doi / references / metadata
drop policy if exists "published article authors visible" on public.article_authors;
create policy "published article authors visible" on public.article_authors for select to anon, authenticated using (exists (select 1 from public.articles a where a.id = article_authors.article_id and a.publication_status in ('early_access','published','corrected')));
drop policy if exists "editorial can manage article authors" on public.article_authors;
create policy "editorial can manage article authors" on public.article_authors for all to authenticated using (public.is_editorial(public.article_journal(article_authors.article_id))) with check (public.is_editorial(public.article_journal(article_authors.article_id)));

drop policy if exists "editorial can manage article versions" on public.article_versions;
create policy "editorial can manage article versions" on public.article_versions for all to authenticated using (public.is_editorial(public.article_journal(article_versions.article_id))) with check (public.is_editorial(public.article_journal(article_versions.article_id)));
drop policy if exists "published article versions visible" on public.article_versions;
create policy "published article versions visible" on public.article_versions for select to anon, authenticated using (exists (select 1 from public.articles a where a.id = article_versions.article_id and a.publication_status in ('early_access','published','corrected')));

drop policy if exists "editorial can view production records" on public.production_records;
create policy "editorial can view production records" on public.production_records for select to authenticated using (public.is_production(public.article_journal(production_records.article_id)));
drop policy if exists "editorial can manage production records" on public.production_records;
create policy "editorial can manage production records" on public.production_records for all to authenticated using (public.is_production(public.article_journal(production_records.article_id))) with check (public.is_production(public.article_journal(production_records.article_id)));

drop policy if exists "editorial can manage doi records" on public.doi_records;
create policy "editorial can manage doi records" on public.doi_records for all to authenticated using (public.is_editorial(public.article_journal(doi_records.article_id)) or public.is_production(public.article_journal(doi_records.article_id))) with check (public.is_editorial(public.article_journal(doi_records.article_id)) or public.is_production(public.article_journal(doi_records.article_id)));

drop policy if exists "editorial can manage references" on public.article_references;
create policy "editorial can manage references" on public.article_references for all to authenticated using (public.is_editorial(public.article_journal(article_references.article_id))) with check (public.is_editorial(public.article_journal(article_references.article_id)));

drop policy if exists "editorial can manage article metadata" on public.article_metadata;
create policy "editorial can manage article metadata" on public.article_metadata for all to authenticated using (public.is_editorial(public.article_journal(article_metadata.article_id)) or public.is_production(public.article_journal(article_metadata.article_id))) with check (public.is_editorial(public.article_journal(article_metadata.article_id)) or public.is_production(public.article_journal(article_metadata.article_id)));

-- ============================================================
-- NOTIFICATIONS / AUDIT / EMAIL LOGS / SYSTEM JOBS
-- ============================================================
drop policy if exists "users view own notifications" on public.notifications;
create policy "users view own notifications" on public.notifications for select to authenticated using (user_id = auth.uid());
drop policy if exists "users update own notifications" on public.notifications;
create policy "users update own notifications" on public.notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "admins can view audit logs" on public.audit_logs;
create policy "admins can view audit logs" on public.audit_logs for select to authenticated using (public.is_super_admin());

drop policy if exists "admins can view system jobs" on public.system_jobs;
create policy "admins can view system jobs" on public.system_jobs for select to authenticated using (public.is_super_admin() or exists (select 1 from public.journal_members jm where jm.user_id = auth.uid() and jm.is_active = true and jm.role in ('journal_admin','journal_manager','super_admin')));
drop policy if exists "admins can manage system jobs" on public.system_jobs;
create policy "admins can manage system jobs" on public.system_jobs for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin());

select '20260825_fix_rls applied successfully' as status;
