# SECURITY

## Principles

- Supabase RLS is the primary DB boundary; `service_role` is server-only.
- All critical state changes go via server services with permission check + workflow validation + audit.
- Never trust client role or `?paymentSuccess=true`; Stripe webhook must verify `STRIPE_WEBHOOK_SECRET` and be idempotent via `provider_event_id`.
- Never put `CLOUDINARY_API_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `CROSSREF_PASSWORD` in client bundle; Cloudinary signing via `POST /api/upload/signature` (server).
- Double-blind: for `review_blind_type = 'double_blind'`, reviewer API never returns `manuscript_authors` and author never sees reviewer identity; filtering at server.

## Auth

- Supabase Auth: email/password, email verification, password reset, `supabase.auth.getUser()` validates JWT.
- Middleware (`middleware.ts` + `src/middleware.ts`) refreshes session and redirects unauth from protected prefixes. Fixed bug where `pathname.startsWith("/auth")` incorrectly treated `"/author"` as public — now uses `pathname === p || pathname.startsWith(p + "/")`.
- Server Components also enforce `if (!user) redirect("/auth/login")` and `export const dynamic = "force-dynamic"`.

## RBAC

- `journal_members` is the source; roles via `user_role` enum (12). User may have different roles per journal.
- Helpers in `src/lib/rbac.ts`: `hasJournalRole`, `isSuperAdmin`, `canAccessManuscript`, etc. Never rely on `user.role === "editor"` in client; enforce server + RLS.
- Finance info (`apcs`, `invoices`, `payments`) only visible to author of manuscript or `finance_admin/journal_admin/super_admin` via `has_journal_role`; reviewer RLS blocks it (verified: reviewer cannot select APC).

## RLS

- Enabled on all tables; policies in `schema.sql` + `supabase/migrations/20260825_fix_rls.sql`.
- Tests: `author1` cannot see `author2`'s draft; `reviewer` cannot see `APC`; anon can only see `published` articles; cross-journal isolation via `has_journal_role`.
- For tables with missing policies, server components use `createAdminClient` after verifying `user.id` owns or is editor, with app-level checks.

## File Storage

- Cloudinary: `src/lib/cloudinary.ts` is `server-only`; `uploadManuscript`, `deleteAsset`, `createSignedUploadParams` use `cloudinary.utils.api_sign_request` server-side; folder `journals/{journalId}/manuscripts/{manuscriptId}/v{n}/`.

## Payments

- `POST /api/payments/checkout` creates Stripe session server-side; `POST /api/payments/webhook` verifies signature, updates `payments`/`invoices`/`apcs` transactionally, creates `system_jobs`.

## Audit

- `audit_logs` for every important action; `workflow_events` for status transitions; `email_logs` for sent mail; immutable, not editable by normal users.

## Headers

- `next.config.ts` remotePatterns for `res.cloudinary.com` and `*.supabase.co`.
