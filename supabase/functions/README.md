# Supabase Edge Functions — Metademic

## Functions

| Function | Path | Auth | Purpose |
|----------|------|------|---------|
| `api` | `supabase/functions/api` | `verify_jwt=false` (public journals/articles) / `true` for manuscripts | Full REST API alternative to Next.js — journals, manuscripts, reviews, notifications, search. Deploy: `supabase functions deploy api --no-verify-jwt` |
| `workflow-engine` | `supabase/functions/workflow-engine` | `verify_jwt=true` | Automatic workflow: `author submit → reviewer → admin`. Called by DB triggers via `pg_net.http_post` or by cron. Handles `manuscript_submitted`, `review_submitted`, `process_all`. |
| `notifications` | `supabase/functions/notifications` | `verify_jwt=true` | Dedicated notification dispatcher: `reviewer_invited`, `reviewer_accepted`, `decision_made`, etc. |
| `cron-dispatcher` | `supabase/functions/cron-dispatcher` | `verify_jwt=true` | Hourly/daily cron: `overdue`, `reminders`, `stale`, `system_jobs`, `auto_transition`. Invoked by `pg_cron` via `net.http_post` or directly via SQL fallback. |

Shared: `supabase/functions/_shared/cors.ts` + `supabase/functions/_shared/supabase.ts` (service/anon clients, `hasJournalRole`).

## Deploy

```bash
supabase login
supabase link --project-ref rzflrmgiuamljkxupbvr
supabase functions deploy api --no-verify-jwt
supabase functions deploy workflow-engine
supabase functions deploy notifications
supabase functions deploy cron-dispatcher
```

Set env in Supabase Dashboard → Edge Functions → Secrets: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (auto-injected), `CLOUDINARY_*` if needed.

Invoke:

```bash
curl https://rzflrmgiuamljkxupbvr.supabase.co/functions/v1/api/health
curl https://rzflrmgiuamljkxupbvr.supabase.co/functions/v1/api/journals?limit=2
curl -H "Authorization: Bearer <user_jwt>" https://rzflrmgiuamljkxupbvr.supabase.co/functions/v1/api/manuscripts
curl -X POST -H "Authorization: Bearer <service_role>" -H "Content-Type: application/json" \
  -d '{"action":"manuscript_submitted","manuscript_id":"<uuid>"}' \
  https://rzflrmgiuamljkxupbvr.supabase.co/functions/v1/workflow-engine
```

## Automation Sources

- **DB Triggers** (`supabase/migrations/20260826_workflow_automation.sql`): `handle_manuscript_status_change` (on `manuscripts.status`), `handle_reviewer_invitation`, `handle_review_assignment`, `handle_editorial_decision`. They directly `INSERT` into `notifications`, `email_logs`, `system_jobs`, `workflow_events`, and auto-create `review_rounds`/`revision_requests`. No HTTP needed for core flow.
- **pg_cron** (`supabase/migrations/20260827_cron_jobs.sql`): `cron_mark_overdue` (hourly), `cron_send_reminders` (daily 09:00), `cron_check_stale_submissions` (6h), `cron_process_system_jobs` (5m), `cron_auto_transition` (10m). All `security definer`, idempotent, scheduled via `cron.schedule`.
- **Edge Functions as fallback**: cron jobs try `net.http_post` to `cron-dispatcher`/`workflow-engine` if `app.supabase_url` is set via `ALTER DATABASE postgres SET app.supabase_url = 'https://...'`. If `pg_net` not available, they fall back to local SQL processing.

## Manual Apply

In Supabase Dashboard → SQL Editor, run in order:

1. `supabase/migrations/20260825_fix_rls.sql` (if not already)
2. `supabase/migrations/20260826_workflow_automation.sql`
3. `supabase/migrations/20260827_cron_jobs.sql`

Then:

```sql
-- Verify triggers
select trigger_name, event_object_table from information_schema.triggers where trigger_schema='public';
-- Verify cron
select jobname, schedule, command from cron.job;
-- Test: submit a manuscript and check notifications
update manuscripts set status='submitted' where manuscript_number='SEED-0001';
select * from notifications order by created_at desc limit 5;
```

## Next.js vs Edge

Next.js `src/app/api/*` remains the primary API for the web app (uses `createAdminClient` after auth). Edge `api` is an alternative for mobile/third-party or for cron-triggered automation. Both share the same `workflow.ts` state machine and `supabase` DB.

