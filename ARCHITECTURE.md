# ARCHITECTURE

## Layers

```
Next.js App Router (UI)
    ↓
Server Components / Route Handlers / Server Actions (authz, validation)
    ↓
lib/services/* (business logic, transactions, audit, notifications)
    ↓
lib/repositories/* (data access)
    ↓
Supabase Postgres (source of truth) + RLS
    ↓
Cloudinary (file storage) + Stripe/Crossref (external)
```

- **UI** never writes directly to DB for critical state; goes via service → permission check → workflow validation → transaction → audit → notification → email job.
- **File storage**: Cloudinary only; Postgres stores `storage_bucket`, `storage_path` (public_id), `secure_url`, `resource_type`, `format`, `bytes`, `checksum` in `manuscript_files`.

## Route Structure

```
src/app/(public)/          # journal home, articles, issues, search — SEO, JSON-LD, OpenGraph
src/app/auth/              # login/register/forgot/reset + callback
src/app/author/            # dashboard, submissions, 12-step wizard, revision
src/app/reviewer/          # dashboard, invitations, review portal
src/app/editor/            # dashboard, submissions, manuscript detail, reviewer selector, decisions
src/app/production/        # copyediting → typesetting → proof → ready
src/app/finance/           # APC, waivers, invoices, Stripe checkout/webhook
src/app/admin/             # journals, users, audit, analytics, jobs, issues
src/app/api/               # REST handlers for manuscripts, reviews, APC, DOI, production, etc.
src/components/ui/         # shadcn
src/lib/supabase/          # browser/server/admin clients
src/lib/validations/       # Zod
src/lib/workflow.ts        # state machine
src/lib/rbac.ts            # role checks
src/lib/services/          # manuscript, review, apc, doi, notification
src/lib/repositories/      # manuscripts etc
```

## Data Flow Example: Submit Manuscript

```
Wizard (12 steps, autosave to localStorage + draft row via POST /api/manuscripts)
  → POST /api/manuscripts/[id]/submit validates Zod, checks auth, calls manuscript-service.submitManuscript:
      validateTransition(draft→submitted) → update manuscripts → create manuscript_versions v1 → workflow_events → audit_logs → notifications → system_jobs(send_email)
```

## Security

- Middleware (`middleware.ts` + `src/middleware.ts`) refreshes Supabase session and redirects unauth from `/author`, `/reviewer`, `/editor`, `/production`, `/finance`, `/admin`, `/account`, `/onboarding` (fixed `startsWith("/auth")` bug that previously treated `/author` as public).
- Server Components also do `if (!user) redirect("/auth/login")` + `export const dynamic = "force-dynamic"`.
- RLS enabled on all tables; policies via `supabase/migrations/20260825_fix_rls.sql`; server components use `createAdminClient` after auth check for tables with missing RLS, with app-level ownership checks.

## Jobs

`system_jobs` table: `send_email`, `reviewer_reminder`, `mark_overdue`, `doi_registration`, `document_processing` etc. For now, Next.js + Supabase Edge Functions handle lightweight; `document_processing` is worker-compatible for future NestJS.

## Deployment

Vercel (Next.js) + Supabase (DB/Auth) + Cloudinary (assets). Env via `.env.local` / Vercel env. No microservices initially, but `system_jobs` + services are worker-ready.
