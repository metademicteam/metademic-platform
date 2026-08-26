# Metademic — Scholarly Publishing Platform

Production-ready, OJS-class journal management, peer-review, editorial, APC, production, DOI and publication platform built with Next.js 15, Supabase, and Cloudinary. Supports the full lifecycle:

```
Journal → Submission → Technical Check → Editor Assignment → Editorial Screening → Reviewer Invitation → Peer Review → Decision → Revision → Acceptance → APC → Copyediting → Typesetting → Proof → DOI → Publication → Public Article
```

## Quick Start

```bash
# 1. Clone and install
npm install --legacy-peer-deps

# 2. Configure env (see ENVIRONMENT.md)
cp .env.example .env.local
# fill NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
# fill CLOUDINARY_CLOUD_NAME / API_KEY / API_SECRET
# fill NEXT_PUBLIC_APP_URL=http://localhost:3000

# 3. Database: schema.sql has already been executed in Supabase.
#    Apply RLS fix if needed:
#    Supabase Dashboard → SQL Editor → run supabase/migrations/20260825_fix_rls.sql

# 4. Seed (idempotent, never in production)
$env:NEXT_PUBLIC_SUPABASE_URL="https://..."; $env:SUPABASE_SERVICE_ROLE_KEY="..."; npx tsx src/lib/seed.ts

# 5. Run
npm run dev
# open http://localhost:3000
```

## Demo Accounts (seed)

All seeded via `src/lib/seed.ts` with password `Test1234!` (also `supabase/demo-accounts.sql` provides `demo.*@metademic.test` / `Demo1234!`):

| Role | Email | Password | Access |
|------|-------|----------|--------|
| Super Admin | superadmin@example.test | Test1234! | /admin, all journals |
| Journal Admin | journaladmin@example.test | Test1234! | /admin/journals |
| EIC | eic@example.test | Test1234! | /editor |
| Author | author1@example.test … author10@example.test | Test1234! | /author/dashboard |
| Reviewer | reviewer1@example.test … | Test1234! | /reviewer/dashboard |
| Finance | finance1@example.test | Test1234! | /finance |
| Production | production1@example.test | Test1234! | /production |

Also: `demo.author@metademic.test` / `Demo1234!` etc via `supabase/demo-accounts.sql`.

## Routes

- Public: `/`, `/journals`, `/journals/[slug]`, `/articles`, `/articles/[slug]`, `/issues`, `/search`, `/about`
- Auth: `/auth/login`, `/auth/register`, `/auth/forgot-password`, `/onboarding`
- Author: `/author/dashboard`, `/author/submissions`, `/author/submissions/new` (12-step wizard), `/author/submissions/[id]`
- Reviewer: `/reviewer/dashboard`, `/reviewer/invitations`, `/reviewer/reviews/[id]`
- Editor: `/editor/dashboard`, `/editor/submissions`, `/editor/manuscripts/[id]`, `/editor/reviewers`
- Production: `/production/dashboard`, `/production/articles/[id]`
- Finance: `/finance/dashboard`, `/finance/invoices/[id]`
- Admin: `/admin/dashboard`, `/admin/journals`, `/admin/users`, `/admin/audit`, `/admin/analytics`, `/admin/jobs`

## Stack

- Next.js 15 App Router, TypeScript strict, Tailwind 4, shadcn/ui, React Hook Form + Zod, TanStack Query, Lucide
- Supabase (Postgres, Auth, Realtime, RLS), Cloudinary, Stripe (webhook-verified), Crossref DOI

## Key Decisions

- **Supabase as source of truth** for structured state; **Cloudinary** for files; **Next.js** for UI; **server services** for business logic (never trust client).
- **Workflow state machine** in `src/lib/workflow.ts` — invalid `published → draft` is rejected; all transitions via server services with audit + notification.
- **RLS is the security boundary** — `service_role` never exposed to browser; double-blind anonymity enforced via server filtering + RLS.
- **Immutable versions** — `manuscript_versions` + `manuscript_files.version_id`; revision always creates `v{n+1}`.
- **APC/payment** — server creates Stripe session; webhook verifies `STRIPE_WEBHOOK_SECRET` and is idempotent via `provider_event_id`; never trusts `?paymentSuccess=true`.
- **DOI** — `doi_records` + `system_jobs` (`doi_registration`); Crossref metadata via `src/lib/services/doi-service.ts`; async job.

## Automation — Author → Reviewer → Admin

**Triggers + pg_cron + Edge Functions** make the workflow automatic (see `supabase/AUTOMATION.md`):

- **DB Triggers** (`supabase/migrations/20260826_workflow_automation.sql`): `handle_manuscript_status_change` (submitted → notify editors + author), `handle_reviewer_invitation` (invite → notify reviewer), `handle_review_assignment` (accept/complete → notify editors, auto `reviews_complete`), `handle_editorial_decision` (notify author, create `revision_requests`/APC).
- **Cron** (`supabase/migrations/20260827_cron_jobs.sql`): `cron_mark_overdue` (hourly), `cron_send_reminders` (daily 09:00), `cron_check_stale_submissions` (6h), `cron_process_system_jobs` (5m), `cron_auto_transition` (10m). Requires `pg_cron` + `pg_net` extensions.
- **Edge Functions** (`supabase/functions/*`): `api` (REST), `workflow-engine` (HTTP handler for `manuscript_submitted` etc.), `notifications` (reviewer/admin dispatch), `cron-dispatcher` (hourly processing). Deploy via `supabase functions deploy`.

Apply in Supabase Dashboard → SQL Editor:

```sql
-- 1. RLS fix (if not already)
-- 2. supabase/migrations/20260826_workflow_automation.sql
-- 3. supabase/migrations/20260827_cron_jobs.sql
-- 4. supabase/set-app-settings.sql (set app.supabase_url for pg_net HTTP)
```

Test:

```bash
node --import tsx test-automation.js  # full auto: author submit → reviewer → admin
```

See `supabase/AUTOMATION.md`, `supabase/functions/README.md`.

## Testing

```bash
npx vitest run --reporter=verbose
node --import tsx test-platform.js   # integration: auth, RLS, public pages, protected redirects
node --import tsx test-lifecycle.js  # full manuscript lifecycle draft → published
node --import tsx test-automation.js # automation: author → reviewer → admin
```

See `TESTING.md`, `ARCHITECTURE.md`, `DATABASE.md`, `SECURITY.md`, `WORKFLOW.md`, `DEPLOYMENT.md`, `ENVIRONMENT.md`, `CLOUDINARY.md`, `SUPABASE.md`, `API.md`.
