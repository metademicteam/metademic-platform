# API

All handlers under `src/app/api/` — Next.js Route Handlers, Zod-validated, auth-checked.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/journals?limit=&q=&status=` | public | List journals |
| POST | `/api/journals` | journal_admin/super_admin | Create journal |
| GET/PATCH | `/api/journals/[id]` | admin | Get/update journal |
| GET/POST | `/api/manuscripts?search=&status=` | auth | List/create (service creates `manuscript_number` via RPC `generate_manuscript_number`, `manuscript_versions` v1) |
| GET/PATCH | `/api/manuscripts/[id]` | owner/editor | Get/update |
| POST | `/api/manuscripts/[id]/submit` | owner | draft→submitted |
| POST | `/api/manuscripts/[id]/technical-check` | editor | checklist → PASS/RETURN/DESK_REJECT |
| POST | `/api/manuscripts/[id]/assign-editor` | editor admin | assign editor |
| POST | `/api/manuscripts/[id]/reviewers` | editor | invite reviewers (creates `review_rounds` via `reviewers_required`) |
| POST | `/api/manuscripts/[id]/editorial-decision` | editor | decision with vote counts + system recommendation |
| POST | `/api/manuscripts/[id]/revision-request` | editor | create `revision_requests` |
| POST | `/api/manuscripts/[id]/respond` | author | `author_responses` to `review_comments` |
| POST | `/api/manuscripts/[id]/accept` | editor | acceptance + APC |
| GET/POST | `/api/manuscripts/[id]/files` | auth | list/insert `manuscript_files` (Cloudinary metadata) |
| POST | `/api/upload/signature` | auth | Cloudinary signed params (never leaks secret) |
| GET | `/api/upload/signature` | — | health |
| POST | `/api/review-invitations/[id]/respond` | reviewer | accept/decline with COI confirms |
| GET/POST | `/api/reviews` | reviewer | list/create |
| GET/PATCH | `/api/reviews/[id]` | reviewer | get/update (RLS) |
| POST | `/api/review-assignments/[id]/submit` | reviewer | submit `review_reports` + `review_annotations`, completes round |
| POST | `/api/apc/calculate` | auth | `calculateApc` |
| POST | `/api/apc/waiver` | author/finance | request/approve |
| GET/POST | `/api/invoices` | finance | list/create |
| GET/PATCH | `/api/invoices/[id]` | finance | get/update |
| POST | `/api/payments/checkout` | author | Stripe session (server) |
| POST | `/api/payments/webhook` | — | Stripe webhook (verifies `STRIPE_WEBHOOK_SECRET`, idempotent) |
| POST | `/api/production/[articleId]` | production | update `production_records` status |
| POST | `/api/doi/register` | editor | enqueue `system_jobs` doi_registration |
| POST | `/api/doi/webhook` | — | mock Crossref callback |
| POST | `/api/articles/publish` | editor | publish (creates `articles`, `doi_records`, `production_records`) |
| GET/POST | `/api/volumes` | editor | list/create volumes |
| GET/POST | `/api/issues` | editor | list/create issues |
| POST | `/api/issues/assign` | editor | assign article to issue |
| GET/POST | `/api/jobs` | admin | list `system_jobs` |
| GET/PATCH | `/api/notifications` | auth | list |
| POST | `/api/notifications/[id]/read` | auth | mark read |

All POST validate Zod, check `supabase.auth.getUser()`, enforce `has_journal_role`/`is_journal_member`, call `validateTransition`, write `audit_logs`/`workflow_events`/`notifications` in transaction where possible.
