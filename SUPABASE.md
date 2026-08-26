# SUPABASE

Project: `https://rzflrmgiuamljkxupbvr.supabase.co`

## Setup

1. Create Supabase project.
2. SQL Editor → run `schema.sql` (idempotent, creates extensions, enums, tables, indexes, triggers, functions, RLS). Do not re-run destructively.
3. SQL Editor → run `supabase/migrations/20260825_fix_rls.sql` (adds missing RLS policies).
4. Auth → confirm email/password provider enabled; `site URL` = `NEXT_PUBLIC_APP_URL`.
5. No storage buckets needed — files go to Cloudinary.

## Clients

- `src/lib/supabase/browser.ts` — `createBrowserClient` with `NEXT_PUBLIC_SUPABASE_ANON_KEY` (publishable), for client components.
- `src/lib/supabase/server.ts` — `createServerClient` with `cookies()` from `next/headers`, for Server Components/Route Handlers; `getServerUser()` / `getUser()` helpers.
- `src/lib/supabase/admin.ts` — `createAdminClient` with `SUPABASE_SERVICE_ROLE_KEY`, server-only, bypasses RLS (use after auth check).

## Auth

- `supabase.auth.signInWithPassword`, `signUp` with `emailRedirectTo` → `/auth/callback`, `resetPasswordForEmail`, `updateUser`.
- `middleware.ts` + `src/middleware.ts` refresh session via `supabase.auth.getUser()` and redirect unauth.
- Onboarding (`/onboarding`) saves to `profiles` + `author_profiles`/`reviewer_profiles`.

## Realtime

- `notifications` table is Realtime-ready (subscribe via `supabase.channel` where needed); `supabase/realtime` is enabled for that table.

## RLS

- See `DATABASE.md` and `SECURITY.md`. Test with:
  ```bash
  $env:NEXT_PUBLIC_SUPABASE_URL=...; $env:NEXT_PUBLIC_SUPABASE_ANON_KEY=...; node --import tsx test-platform.js
  ```
  Checks: anon sees only `published` articles; author cannot see others' drafts; reviewer cannot see APC.

## Seed

- `src/lib/seed.ts` (password `Test1234!`, 2 journals, 20 manuscripts, 15 reviewers, etc.) or `supabase/demo-accounts.sql` (3 demo users, `Demo1234!`).
