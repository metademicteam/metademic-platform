-- ============================================================
-- Migration: 20260828_fix_manuscript_number_rpc
-- Fixes POST /api/manuscripts → 500 "permission denied for function
-- generate_manuscript_number".
--
-- Root cause: the function was defined as plain plpgsql (invoker
-- rights) with NO grant to `authenticated`, so supabase-js calls
-- via PostgREST failed with permission denied and the service
-- surfaced it as a 500. Made it SECURITY DEFINER + granted execute,
-- matching the other RLS helper functions. Idempotent — safe to re-run.
-- ============================================================

-- Ensure the backing sequence exists (schema.sql is source of truth,
-- but be safe on live DBs where the migration may not have run).
create sequence if not exists public.manuscript_sequence;

-- Recreate the RPC as security definer so the authenticated role can
-- invoke it without RLS/ownership issues.
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

-- Grant execution to the roles supabase-js uses.
grant execute on function public.generate_manuscript_number(uuid) to authenticated, service_role, anon;
grant usage, select on sequence public.manuscript_sequence to authenticated, service_role;

-- Also grant the sequence usage to anon (harmless; RLS still governs
-- actual manuscript rows).
grant usage on sequence public.manuscript_sequence to anon;
