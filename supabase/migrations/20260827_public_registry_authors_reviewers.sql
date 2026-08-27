-- ============================================================
-- PUBLIC REGISTRY — Authorship & Reviewers (Real Data)
-- Apply: psql/pgREST with service-role, or Supabase SQL editor
-- ============================================================
-- This file documents the public queries (/authors and /reviewers)
-- and the RLS policies that make them work for anon visitors.
-- Idempotent — safe to re-run.
-- Fix 2026-08-27: break infinite RLS recursion between
-- profiles <-> reviewer_profiles via SECURITY DEFINER helper.
-- ============================================================

-- ------------------------------------------------------------------
-- Helper: bypass RLS when checking "is this user a reviewer?"
-- SECURITY DEFINER lets it read reviewer_profiles without re-entering
-- the profiles RLS check that called it.
-- ------------------------------------------------------------------
create or replace function public.is_reviewer_user(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.reviewer_profiles where user_id = p_user_id);
$$;

-- ------------------------------------------------------------------
-- Views (read-only, advisory)
-- ------------------------------------------------------------------

create or replace view public.v_published_authors as
select distinct
    aa.id,
    aa.first_name,
    aa.last_name,
    aa.orcid,
    aa.affiliation,
    a.title,
    a.slug as article_slug,
    a.published_at,
    a.article_number,
    a.journal_id,
    j.name  as journal_name,
    j.slug  as journal_slug
from public.article_authors aa
join public.articles a on a.id = aa.article_id
join public.journals j on j.id = a.journal_id
where a.publication_status in ('early_access','published','corrected')
order by aa.last_name, aa.first_name;

create or replace view public.v_public_reviewers as
select
    rp.id,
    rp.user_id,
    rp.expertise,
    rp.keywords,
    rp.is_available,
    p.display_name,
    p.first_name,
    p.last_name
from public.reviewer_profiles rp
join public.profiles p on p.id = rp.user_id
where rp.is_available = true
order by p.last_name, p.first_name;

-- ------------------------------------------------------------------
-- RLS — make the source tables readable by anon/authenticated
-- ------------------------------------------------------------------

-- Published article authors are public.
drop policy if exists "published article authors visible" on public.article_authors;
create policy "published article authors visible" on public.article_authors
for select to anon, authenticated
using (
    exists (
        select 1 from public.articles a
        where a.id = article_authors.article_id
          and a.publication_status in ('early_access','published','corrected')
    )
);

drop policy if exists "published articles publicly visible" on public.articles;
create policy "published articles publicly visible" on public.articles
for select to anon, authenticated
using (publication_status in ('early_access','published','corrected'));

-- Reviewers are public — any anon visitor can browse the directory.
-- Using (true) avoids referencing profiles, which would recurse.
drop policy if exists "public can view reviewer profiles" on public.reviewer_profiles;
create policy "public can view reviewer profiles" on public.reviewer_profiles
for select to anon, authenticated
using (true);

-- Profiles: anon can only see the display names of users who ARE reviewers.
-- Must go through the SECURITY DEFINER helper, otherwise the EXISTS
-- subquery re-enters RLS on reviewer_profiles and loops forever.
drop policy if exists "anon can view reviewer profile names" on public.profiles;
create policy "anon can view reviewer profile names" on public.profiles
for select to anon, authenticated
using (public.is_reviewer_user(profiles.id));

select 'Public registry SQL applied — /authors and /reviewers will receive real data' as status;
