-- ============================================================
-- DEMO ACCOUNTS — Author, Reviewer, Admin
-- ============================================================
-- Run this in: Supabase Dashboard -> SQL Editor -> New query -> Run
--
-- Creates 3 demo users you can sign in with immediately
-- (emails are pre-confirmed, passwords are set server-side).
--
-- Demo credentials:
--   Author   -> demo.author@metademic.test  /  Demo1234!
--   Reviewer -> demo.reviewer@metademic.test /  Demo1234!
--   Admin    -> demo.admin@metademic.test   /  Demo1234!
--
-- The Admin account is a super_admin in journal_members, so it can
-- access /admin, /editor, /production, /finance routes.
--
-- Idempotent: safe to run more than once.
-- ============================================================

-- ------------------------------------------------------------------
-- 1. Create auth users (confirmed, so no email verification needed)
-- ------------------------------------------------------------------

insert into auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token,
    email_change,
    email_change_token_new,
    recovery_token
)
values
(
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-0000-0000-000000000001',
    'authenticated',
    'authenticated',
    'demo.author@metademic.test',
    crypt('Demo1234!', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"first_name":"Demo","last_name":"Author","display_name":"Demo Author"}',
    now(),
    now(),
    '',
    '',
    '',
    ''
),
(
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-0000-0000-000000000002',
    'authenticated',
    'authenticated',
    'demo.reviewer@metademic.test',
    crypt('Demo1234!', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"first_name":"Demo","last_name":"Reviewer","display_name":"Demo Reviewer"}',
    now(),
    now(),
    '',
    '',
    '',
    ''
),
(
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-0000-0000-000000000003',
    'authenticated',
    'authenticated',
    'demo.admin@metademic.test',
    crypt('Demo1234!', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"first_name":"Demo","last_name":"Admin","display_name":"Demo Admin"}',
    now(),
    now(),
    '',
    '',
    '',
    ''
)
on conflict (id) do update
set
    email = excluded.email,
    encrypted_password = excluded.encrypted_password,
    email_confirmed_at = coalesce(auth.users.email_confirmed_at, now()),
    raw_user_meta_data = excluded.raw_user_meta_data,
    updated_at = now();

-- ------------------------------------------------------------------
-- 2. Ensure auth identities exist (required for sign-in)
-- ------------------------------------------------------------------

insert into auth.identities (
    provider_id,
    user_id,
    identity_data,
    provider,
    last_sign_in_at,
    created_at,
    updated_at
)
select
    u.id::text,
    u.id,
    jsonb_build_object(
        'sub', u.id::text,
        'email', u.email,
        'email_verified', true,
        'phone_verified', false
    ),
    'email',
    now(),
    now(),
    now()
from auth.users u
where u.email in (
    'demo.author@metademic.test',
    'demo.reviewer@metademic.test',
    'demo.admin@metademic.test'
)
on conflict (provider_id, provider) do nothing;

-- ------------------------------------------------------------------
-- 3. Public profiles
-- ------------------------------------------------------------------

insert into public.profiles (id, email, first_name, last_name, display_name, country_code, bio, timezone, status)
values
    ('00000000-0000-0000-0000-000000000001', 'demo.author@metademic.test', 'Demo', 'Author', 'Demo Author', 'US', 'Demo author account for exploring the platform.', 'UTC', 'active'),
    ('00000000-0000-0000-0000-000000000002', 'demo.reviewer@metademic.test', 'Demo', 'Reviewer', 'Demo Reviewer', 'GB', 'Demo reviewer account for exploring the platform.', 'UTC', 'active'),
    ('00000000-0000-0000-0000-000000000003', 'demo.admin@metademic.test', 'Demo', 'Admin', 'Demo Admin', 'US', 'Demo admin account for exploring the platform.', 'UTC', 'active')
on conflict (id) do update
set
    email = excluded.email,
    first_name = excluded.first_name,
    last_name = excluded.last_name,
    display_name = excluded.display_name,
    country_code = excluded.country_code,
    bio = excluded.bio,
    timezone = excluded.timezone,
    status = excluded.status;

-- ------------------------------------------------------------------
-- 4. Institutions (shared reference table)
-- ------------------------------------------------------------------

insert into public.institutions (id, name, short_name, country_code, website)
values
    ('00000000-0000-0000-0000-000000000101', 'Metademic University', 'Metademic U', 'US', 'https://metademic.test'),
    ('00000000-0000-0000-0000-000000000102', 'Global Institute of Technology', 'GIT', 'GB', 'https://git.test')
on conflict (id) do update
set
    name = excluded.name,
    short_name = excluded.short_name,
    country_code = excluded.country_code,
    website = excluded.website;

-- ------------------------------------------------------------------
-- 5. Author / reviewer profile rows (RLS: own-row policies apply)
-- ------------------------------------------------------------------

insert into public.author_profiles (user_id, institution_id, department, position, research_interests)
values
    ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000101', 'Department of Computer Science', 'PhD Candidate', array['machine learning', 'open science', 'peer review'])
on conflict (user_id) do update
set
    institution_id = excluded.institution_id,
    department = excluded.department,
    position = excluded.position,
    research_interests = excluded.research_interests;

insert into public.reviewer_profiles (user_id, institution_id, expertise, keywords, is_available, max_active_reviews)
values
    ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000102', array['machine learning', 'statistics', 'reproducibility'], array['ml', 'open science'], true, 5)
on conflict (user_id) do update
set
    institution_id = excluded.institution_id,
    expertise = excluded.expertise,
    keywords = excluded.keywords,
    is_available = excluded.is_available;

-- ------------------------------------------------------------------
-- 6. Ensure the two seed journals exist (idempotent by slug).
--    If they already exist (e.g. created by the seed script), this
--    is a no-op and the memberships/manuscripts pick up their id.
-- ------------------------------------------------------------------

insert into public.journals (id, slug, name, short_name, status, apc_enabled, default_apc, currency, doi_prefix)
values
    ('00000000-0000-0000-0000-000000000301', 'jms', 'Journal of Metademic Science', 'JMS', 'active', true, 1200, 'USD', '10.55555'),
    ('00000000-0000-0000-0000-000000000302', 'ai-review', 'AI Review Letters', 'AIRL', 'active', true, 900, 'USD', '10.55556')
on conflict (slug) do nothing;

-- ------------------------------------------------------------------
-- 7. Journal memberships (drives RBAC / sidebar)
--    Author role on both journals; Reviewer on both; Admin = super_admin on both.
-- ------------------------------------------------------------------

insert into public.journal_members (journal_id, user_id, role, is_active)
select j.id, u.id, m.role::public.user_role, true
from auth.users u
cross join public.journals j
cross join lateral (
    values
        ('00000000-0000-0000-0000-000000000001', 'author'),
        ('00000000-0000-0000-0000-000000000002', 'reviewer'),
        ('00000000-0000-0000-0000-000000000003', 'super_admin'),
        ('00000000-0000-0000-0000-000000000003', 'journal_admin')
) as m(user_id, role)
where u.id = m.user_id::uuid
  and j.status = 'active'
on conflict (journal_id, user_id, role) do nothing;

-- ------------------------------------------------------------------
-- 8. Seed a couple of manuscripts for the demo author
--    so /author/dashboard and /author/submissions have content.
-- ------------------------------------------------------------------

-- Institution snapshots for manuscripts
insert into public.manuscripts (
    id,
    journal_id,
    manuscript_number,
    title,
    abstract,
    article_type,
    keywords,
    subject_areas,
    status,
    current_version,
    current_review_round,
    submitted_by,
    corresponding_author_id,
    submitted_at
)
select
    '00000000-0000-0000-0000-000000000201',
    j.id,
    'DEMO-0001',
    'A demo manuscript on open peer review practices',
    'This is a demo manuscript created for exploring the author workflow. It demonstrates the submission pipeline from draft through review.',
    'research_article'::public.article_type,
    array['peer review', 'open science'],
    array['scholarly communication'],
    'under_review'::public.manuscript_status,
    1,
    1,
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000001',
    now() - interval '14 days'
from public.journals j
where j.slug = 'jms'
on conflict (id) do nothing;

insert into public.manuscripts (
    id,
    journal_id,
    manuscript_number,
    title,
    abstract,
    article_type,
    keywords,
    subject_areas,
    status,
    current_version,
    current_review_round,
    submitted_by,
    corresponding_author_id,
    submitted_at
)
select
    '00000000-0000-0000-0000-000000000202',
    j.id,
    'DEMO-0002',
    'A second demo manuscript on reproducibility in ML',
    'This is a second demo manuscript created for exploring the author workflow. It demonstrates the accepted and production pipeline stages.',
    'research_article'::public.article_type,
    array['reproducibility', 'machine learning'],
    array['artificial intelligence'],
    'accepted'::public.manuscript_status,
    2,
    1,
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000001',
    now() - interval '30 days'
from public.journals j
where j.slug = 'jms'
on conflict (id) do nothing;

-- Manuscript authors (snapshots)
insert into public.manuscript_authors (manuscript_id, user_id, first_name, last_name, email, author_order, is_corresponding)
values
    ('00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000001', 'Demo', 'Author', 'demo.author@metademic.test', 1, true),
    ('00000000-0000-0000-0000-000000000202', '00000000-0000-0000-0000-000000000001', 'Demo', 'Author', 'demo.author@metademic.test', 1, true)
on conflict (manuscript_id, author_order) do nothing;

-- Versions
insert into public.manuscript_versions (manuscript_id, version_number, revision_round, version_label, submitted_by, submitted_at)
values
    ('00000000-0000-0000-0000-000000000201', 1, 0, 'Initial submission', '00000000-0000-0000-0000-000000000001', now() - interval '14 days'),
    ('00000000-0000-0000-0000-000000000202', 1, 0, 'Initial submission', '00000000-0000-0000-0000-000000000001', now() - interval '30 days'),
    ('00000000-0000-0000-0000-000000000202', 2, 1, 'Revision round 1', '00000000-0000-0000-0000-000000000001', now() - interval '7 days')
on conflict (manuscript_id, version_number) do nothing;

-- Review round + assignments so the under_review manuscript has content
insert into public.review_rounds (manuscript_id, round_number, required_reviewers)
values
    ('00000000-0000-0000-0000-000000000201', 1, 3),
    ('00000000-0000-0000-0000-000000000202', 1, 3)
on conflict (manuscript_id, round_number) do nothing;

insert into public.review_assignments (review_round_id, reviewer_id, status, deadline_at)
select
    rr.id,
    rp.id,
    'reviewing'::public.review_status,
    now() + interval '7 days'
from public.review_rounds rr
cross join public.reviewer_profiles rp
where rr.manuscript_id = '00000000-0000-0000-0000-000000000201'
  and rp.user_id = '00000000-0000-0000-0000-000000000002'
on conflict do nothing;

-- Editorial decision for the accepted manuscript
insert into public.editorial_decisions (manuscript_id, review_round_id, editor_id, decision, system_recommendation, accept_votes)
select
    '00000000-0000-0000-0000-000000000202',
    rr.id,
    '00000000-0000-0000-0000-000000000003',
    'accept'::public.decision_type,
    'accept'::public.review_recommendation,
    2
from public.review_rounds rr
where rr.manuscript_id = '00000000-0000-0000-0000-000000000202'
  and not exists (
      select 1 from public.editorial_decisions ed
      where ed.manuscript_id = '00000000-0000-0000-0000-000000000202'
  );

-- APC + invoice for the accepted manuscript
insert into public.apcs (manuscript_id, base_amount, total_amount, currency, status)
values
    ('00000000-0000-0000-0000-000000000202', 1200, 1200, 'USD', 'invoice_issued'::public.apc_status)
on conflict (manuscript_id) do nothing;

insert into public.invoices (apc_id, invoice_number, amount, currency, status, issued_at, due_at)
select
    a.id,
    'INV-DEMO-0001',
    a.total_amount,
    a.currency,
    'issued'::public.invoice_status,
    now(),
    now() + interval '30 days'
from public.apcs a
where a.manuscript_id = '00000000-0000-0000-0000-000000000202'
on conflict (invoice_number) do nothing;

-- ------------------------------------------------------------------
-- 9. Assign submitted manuscripts to the demo reviewer
--    so /reviewer/dashboard has content. Any manuscript in an early
--    review status (submitted / technical_check / editorial_screening /
--    reviewer_invitation / under_review) — whether from the demo author
--    or one you submitted through the wizard — gets a review round +
--    assignment linking it to the demo reviewer.
-- ------------------------------------------------------------------

-- Round 1 for any such manuscript that doesn't have one yet
insert into public.review_rounds (manuscript_id, round_number, required_reviewers)
select
    m.id,
    1,
    3
from public.manuscripts m
where m.status in ('submitted', 'technical_check', 'editorial_screening', 'reviewer_invitation', 'under_review')
  and not exists (
      select 1 from public.review_rounds rr
      where rr.manuscript_id = m.id and rr.round_number = 1
  )
on conflict (manuscript_id, round_number) do nothing;

-- Assignment linking the demo reviewer to each such round
insert into public.review_assignments (review_round_id, reviewer_id, status, invited_at, deadline_at)
select
    rr.id,
    rp.id,
    'invited'::public.review_status,
    now(),
    now() + interval '14 days'
from public.review_rounds rr
join public.manuscripts m on m.id = rr.manuscript_id
cross join public.reviewer_profiles rp
where m.status in ('submitted', 'technical_check', 'editorial_screening', 'reviewer_invitation', 'under_review')
  and rr.round_number = 1
  and rp.user_id = '00000000-0000-0000-0000-000000000002'
  and not exists (
      select 1 from public.review_assignments ra
      where ra.review_round_id = rr.id
        and ra.reviewer_id = rp.id
  );

-- ------------------------------------------------------------------
-- DONE
-- ------------------------------------------------------------------

select
    u.email,
    u.id,
    string_agg(distinct jm.role::text, ', ' order by jm.role::text) as roles
from auth.users u
left join public.journal_members jm on jm.user_id = u.id
where u.email in (
    'demo.author@metademic.test',
    'demo.reviewer@metademic.test',
    'demo.admin@metademic.test'
)
group by u.email, u.id
order by u.email;
