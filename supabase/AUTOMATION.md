# Metademic Automation — Author → Reviewer → Admin

## Desired Flow

```
Author submit (draft → submitted)
  ↓  trigger handle_manuscript_status_change
  → notify editors/admins (manuscript_submitted)
  → notify author (submission_received)
  → system_job technical_check

Editor does technical check → editor_assignment → editorial_screening → reviewer_invitation
  ↓  trigger ensures review_round 1 exists, notifies editors to invite

Editor invites reviewers (via UI or POST /api/manuscripts/[id]/reviewers)
  ↓  trigger handle_reviewer_invitation
  → notify reviewer (reviewer_invited) + email_logs + system_job send_email

Reviewer accepts → handle_review_assignment notifies editors
Reviewer submits review → handle_review_assignment checks review_round_completed → auto manuscript → reviews_complete → trigger notifies admins with system recommendation

Admin sees decision_pending → makes decision (POST /api/manuscripts/[id]/editorial-decision or Edge POST /workflow-engine)
  ↓  trigger handle_editorial_decision
  → notify author (minor_revision/major_revision/accepted/rejected)
  → create revision_requests if needed
  → auto-create APC if accepted

Cron (pg_cron):
  - hourly: cron_mark_overdue → overdue reviews → notifications
  - daily 09:00: cron_send_reminders → pending invitations
  - 6h: cron_check_stale_submissions → >24h in submitted
  - 5m: cron_process_system_jobs → send_email, doi_registration
  - 10m: cron_auto_transition → under_review→reviews_complete, reviews_complete→decision_pending
```

## Files

- `supabase/migrations/20260826_workflow_automation.sql` — all triggers/functions (author→reviewer→admin). Run once in SQL Editor.
- `supabase/migrations/20260827_cron_jobs.sql` — pg_cron schedules + helper functions. Requires `pg_cron` + `pg_net` extensions (enable in Dashboard → Database → Extensions).
- `supabase/functions/workflow-engine` — HTTP alternative for heavy workflow, callable via `pg_net.http_post` from triggers (fallback to local `system_jobs` if pg_net not available).
- `supabase/functions/cron-dispatcher` — cron logic as Edge Function (alternative to pure SQL cron).
- `supabase/functions/notifications` — reviewer/admin notification dispatcher.
- `supabase/functions/api` — REST API (if you prefer Edge over Next.js).

## Testing the Automation

### 1. Apply SQL

In Supabase Dashboard → SQL Editor → New query → paste each migration file and Run.

Verify:

```sql
select * from cron.job; -- should show 5 metademic-* jobs
select trigger_name from information_schema.triggers where event_object_table='manuscripts';
```

### 2. Simulate author submit

As `author1@example.test` (or via service_role for test):

```sql
-- Find a draft
select id, manuscript_number, status from manuscripts where status='draft' limit 1;
-- Simulate submit
update manuscripts set status='submitted', submitted_at=now() where id='<draft_id>';
-- Check notifications were created automatically
select type, title, user_id from notifications where manuscript_id='<draft_id>' order by created_at desc;
-- Should see 2+ rows: manuscript_submitted for editors, submission_received for author
```

Or via Edge Function:

```bash
curl -X POST -H "Authorization: Bearer <service_role>" -H "Content-Type: application/json" \
  -d '{"action":"manuscript_submitted","manuscript_id":"<uuid>"}' \
  https://rzflrmgiuamljkxupbvr.supabase.co/functions/v1/workflow-engine
```

### 3. Simulate reviewer flow

```sql
-- Editor invites reviewer (creates review_round + invitation)
insert into reviewer_invitations (review_round_id, reviewer_id, status) values ('<round_id>', '<reviewer_profile_id>', 'invited');
-- Check reviewer got notification
select * from notifications where type='reviewer_invited' order by created_at desc limit 1;

-- Reviewer accepts
update review_assignments set status='accepted' where id='<assignment_id>';
-- Check editors notified
select * from notifications where type='reviewer_accepted' limit 1;

-- Reviewer completes
update review_assignments set status='completed' where id='<assignment_id>';
insert into review_reports (review_assignment_id, recommendation) values ('<assignment_id>', 'accept');
-- After 2 reviews, manuscript should auto go to reviews_complete → decision_pending via cron_auto_transition (or trigger)
select status from manuscripts where id='<manuscript_id>';
```

### 4. Admin decision

Via Next.js UI: `/editor/manuscripts/<id>` → DecisionPanel → Accept/Minor/Major/Reject.

Or via SQL:

```sql
insert into editorial_decisions (manuscript_id, editor_id, decision, system_recommendation) values ('<id>', '<eic_id>', 'minor_revision', 'minor_revision');
-- Manuscript should become minor_revision and author should get notification
select status from manuscripts where id='<id>';
select * from notifications where type='minor_revision' order by created_at desc limit 1;
```

### 5. Cron

Manually trigger:

```sql
select cron_mark_overdue();
select cron_send_reminders();
select cron_process_system_jobs();
select cron_auto_transition();
-- Or via Edge
select net.http_post(url:='https://rzflrmgiuamljkxupbvr.supabase.co/functions/v1/cron-dispatcher?job=overdue', headers:='{"Authorization":"Bearer '|| current_setting('app.supabase_service_role_key', true) ||'"}'::jsonb);
```

## Notes

- All triggers are `security definer` and use `public.notify_journal_roles` helper to fan-out to `journal_members`.
- `system_jobs` is the bridge for async work (emails, DOI). Edge `cron-dispatcher` or SQL `cron_process_system_jobs` picks `pending` jobs.
- For `pg_net` HTTP calls, set `app.supabase_url` and `app.supabase_service_role_key` in DB: `ALTER DATABASE postgres SET app.supabase_url = 'https://rzflrmgiuamljkxupbvr.supabase.co';`
- Next.js `src/app/api/*` remains primary for UI; Edge `api` is for external/cron use. Both enforce `has_journal_role` and workflow validation.
