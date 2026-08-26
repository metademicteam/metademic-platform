-- ============================================================
-- Migration: 20260828_fix_manuscript_insert_rls
-- Fixes POST /api/manuscripts → 500 "new row violates row-level
-- security policy for table 'manuscripts'".
--
-- Root cause: the live DB has RLS enabled on `manuscripts` but the
-- INSERT policy ("authors can create manuscripts") was never applied
-- (rls-all-tables.sql wasn't run). The RPC fix (20260828_fix_manuscript
-- _number_rpc) only fixed number generation; the actual row insert
-- was still blocked by RLS.
--
-- This migration applies the minimal set needed for the author
-- submission wizard to create a draft:
--   * security-definer helpers the policies reference
--   * manuscripts INSERT policy (submitted_by = auth.uid())
--   * manuscript_versions INSERT policy (needed right after create)
-- Idempotent — safe to re-run.
-- ============================================================

-- ------------------------------------------------------------------
-- 1. Security-definer helpers (break RLS recursion)
-- ------------------------------------------------------------------
create or replace function public.is_manuscript_owner(p_manuscript_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
    select exists (
        select 1 from public.manuscripts m
        where m.id = p_manuscript_id and m.submitted_by = auth.uid()
    );
$$;

create or replace function public.is_manuscript_author(p_manuscript_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
    select exists (
        select 1 from public.manuscripts m
        where m.id = p_manuscript_id
          and (m.submitted_by = auth.uid() or exists (
              select 1 from public.manuscript_authors ma
              where ma.manuscript_id = m.id and ma.user_id = auth.uid()
          ))
    );
$$;

-- ------------------------------------------------------------------
-- 2. manuscripts INSERT policy
-- ------------------------------------------------------------------
drop policy if exists "authors can create manuscripts" on public.manuscripts;
create policy "authors can create manuscripts" on public.manuscripts
for insert to authenticated with check (submitted_by = auth.uid());

-- ------------------------------------------------------------------
-- 3. manuscript_versions INSERT policy (the route inserts a version
--    row immediately after creating the manuscript)
-- ------------------------------------------------------------------
drop policy if exists "authors can create manuscript versions" on public.manuscript_versions;
create policy "authors can create manuscript versions" on public.manuscript_versions
for insert to authenticated
with check (public.is_manuscript_owner(manuscript_versions.manuscript_id));
