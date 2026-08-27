-- ============================================================
-- Fix: manuscripts_submitted_by_fkey violation + profiles 406
-- Root cause: auth.users created but public.profiles row missing,
-- so manuscripts.submitted_by (FK -> profiles.id) rejects the insert
-- and /rest/v1/profiles?... returns 406 (no row / RLS).
-- Also add idempotent auto-create trigger so future signups never break.
-- Idempotent — safe to re-run.
-- ============================================================
begin;

-- Trigger: when a new auth user is created, ensure public.profiles exists
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name, status)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email,'@',1)),
    'active'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill: create missing profiles for existing auth users
insert into public.profiles (id, email, display_name, status)
select au.id, au.email, coalesce(au.raw_user_meta_data->>'full_name', au.raw_user_meta_data->>'name', split_part(au.email,'@',1)), 'active'
from auth.users au
left join public.profiles p on p.id = au.id
where p.id is null
on conflict (id) do nothing;

-- Ensure the insert policy the wizard needs is present (re-applied by 20260825_fix_rls but keep here for fresh DBs)
drop policy if exists "users can create own profile" on public.profiles;
create policy "users can create own profile" on public.profiles for insert to authenticated with check (id = auth.uid());

-- Also allow anon read of own? No — keep RLS tight. The 406 was because row didn't exist, not policy.
-- Keep select policy as-is: users can view own profile
drop policy if exists "users can view own profile" on public.profiles;
create policy "users can view own profile" on public.profiles for select to authenticated using (id = auth.uid());

commit;
-- Verify:
-- select count(*) from auth.users au left join profiles p on p.id=au.id where p.id is null; -- should be 0
-- select * from profiles where id='7ee7b6d8-2b26-4486-9c2b-8ce248e7c84c'::uuid;
