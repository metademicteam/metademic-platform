-- ============================================================
-- Metademic Cron Jobs — pg_cron + pg_net
-- Automatic: overdue checks, reminders, stale detection, system_jobs
-- Requires: pg_cron, pg_net (extensions)
-- Enable in Supabase: Dashboard → Database → Extensions → pg_cron, pg_net
-- ============================================================

begin;

-- Ensure extensions
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- Helper to ensure cron schema exists
create schema if not exists cron;
grant usage on schema cron to postgres;

-- ============================================================
-- Function: cron_mark_overdue — runs every hour
-- ============================================================

create or replace function public.cron_mark_overdue()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_count int := 0;
begin
  for r in
    select ra.id, ra.reviewer_id, ra.review_round_id, rr.manuscript_id, m.journal_id, m.manuscript_number
    from public.review_assignments ra
    join public.review_rounds rr on rr.id = ra.review_round_id
    join public.manuscripts m on m.id = rr.manuscript_id
    where ra.deadline_at < now()
      and ra.status in ('invited','accepted','reviewing')
    limit 100
  loop
    update public.review_assignments set status = 'overdue', updated_at = now() where id = r.id;
    update public.reviewer_profiles set overdue_reviews = overdue_reviews + 1 where id = r.reviewer_id;

    -- Notify reviewer
    insert into public.notifications (user_id, journal_id, manuscript_id, type, title, message, action_url)
    select rp.user_id, r.journal_id, r.manuscript_id, 'review_overdue', 'Review overdue: ' || r.manuscript_number, 'Your review for ' || r.manuscript_number || ' is overdue. Please submit or request extension.', '/reviewer/reviews/' || r.id
    from public.reviewer_profiles rp where rp.id = r.reviewer_id;

    -- Notify editors
    perform public.notify_journal_roles(r.journal_id, r.manuscript_id, array['editor','editor_in_chief','managing_editor']::public.user_role[], 'review_overdue_admin', 'Review overdue: ' || r.manuscript_number, 'Reviewer overdue for ' || r.manuscript_number, '/editor/manuscripts/' || r.manuscript_id);

    insert into public.system_jobs (job_type, entity_type, entity_id, status, payload)
    values ('review_overdue', 'review_assignment', r.id, 'pending', jsonb_build_object('review_assignment_id', r.id, 'manuscript_id', r.manuscript_id));

    v_count := v_count + 1;
  end loop;
  raise notice 'cron_mark_overdue: % marked overdue', v_count;
end;
$$;

-- ============================================================
-- Function: cron_send_reminders — runs daily at 09:00 UTC
-- ============================================================

create or replace function public.cron_send_reminders()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_count int := 0;
begin
  for r in
    select ri.id, ri.reviewer_id, rr.manuscript_id, m.journal_id, m.manuscript_number, m.title, rp.user_id
    from public.reviewer_invitations ri
    join public.review_rounds rr on rr.id = ri.review_round_id
    join public.manuscripts m on m.id = rr.manuscript_id
    join public.reviewer_profiles rp on rp.id = ri.reviewer_id
    where ri.status = 'invited'
      and ri.invited_at < now() - interval '3 days'
      and (ri.metadata->>'reminder_sent') is null
    limit 50
  loop
    insert into public.notifications (user_id, journal_id, manuscript_id, type, title, message, action_url)
    values (r.user_id, r.journal_id, r.manuscript_id, 'reviewer_reminder', 'Reminder: review invitation', 'Reminder: invitation for ' || r.manuscript_number || ' "' || left(r.title,60) || '" is still pending.', '/reviewer/invitations');

    update public.reviewer_invitations set metadata = jsonb_set(coalesce(metadata,'{}'::jsonb), '{reminder_sent}', to_jsonb(now()::text)) where id = r.id;
    insert into public.system_jobs (job_type, entity_type, entity_id, status, payload)
    values ('reviewer_reminder', 'reviewer_invitation', r.id, 'pending', jsonb_build_object('invitation_id', r.id));

    v_count := v_count + 1;
  end loop;
  raise notice 'cron_send_reminders: % sent', v_count;
end;
$$;

-- ============================================================
-- Function: cron_check_stale_submissions — runs every 6 hours
-- ============================================================

create or replace function public.cron_check_stale_submissions()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  for r in
    select id, manuscript_number, journal_id, title from public.manuscripts
    where status = 'submitted' and submitted_at < now() - interval '24 hours'
    limit 50
  loop
    perform public.notify_journal_roles(r.journal_id, r.id, array['managing_editor','journal_admin','super_admin']::public.user_role[], 'stale_submission', 'Stale submission: ' || r.manuscript_number, 'Manuscript ' || r.manuscript_number || ' "' || left(r.title,60) || '" has been in submitted for >24h.', '/editor/manuscripts/' || r.id);
  end loop;
end;
$$;

-- ============================================================
-- Function: cron_process_system_jobs — runs every 5 minutes
-- Picks pending jobs and simulates processing (real worker would call edge function)
-- ============================================================

create or replace function public.cron_process_system_jobs()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_url text;
  v_key text;
begin
  -- Try to invoke edge function for each pending job via pg_net (if configured)
  begin
    v_url := current_setting('app.supabase_url', true);
    v_key := current_setting('app.supabase_service_role_key', true);
  exception when others then
    v_url := null;
  end;

  for r in
    select id, job_type, entity_type, entity_id, payload from public.system_jobs
    where status = 'pending' and scheduled_at <= now()
    order by created_at asc
    limit 20
  loop
    -- If pg_net available and URL configured, call cron-dispatcher edge function
    if v_url is not null and v_key is not null then
      begin
        perform net.http_post(
          url := v_url || '/functions/v1/cron-dispatcher',
          headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || v_key),
          body := jsonb_build_object('job','system_jobs','job_id', r.id)
        );
      exception when others then
        -- Fallback to local processing
        null;
      end;
    end if;

    -- Local fallback: mark send_email jobs as sent for demo
    if r.job_type = 'send_email' then
      update public.system_jobs set status = 'processing', started_at = now(), attempts = attempts + 1 where id = r.id;
      -- Simulate email sent
      update public.email_logs set status = 'sent', sent_at = now() where recipient_email = (r.payload->>'recipient') and status = 'queued';
      update public.system_jobs set status = 'completed', completed_at = now() where id = r.id;
    elsif r.job_type = 'doi_registration' then
      update public.system_jobs set status = 'processing', started_at = now() where id = r.id;
      -- Simulate DOI registered
      update public.doi_records set registration_status = 'registered', registered_at = now() where article_id = (r.payload->>'article_id')::uuid;
      update public.system_jobs set status = 'completed', completed_at = now() where id = r.id;
    else
      -- Generic: mark processing then completed after 1 attempt
      update public.system_jobs set status = 'completed', completed_at = now(), started_at = coalesce(started_at, now()) where id = r.id;
    end if;
  end loop;
end;
$$;

-- ============================================================
-- Function: cron_auto_transition — runs every 10 minutes
-- Auto-moves manuscripts where review round completed but status not updated
-- ============================================================

create or replace function public.cron_auto_transition()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_round uuid;
  v_completed boolean;
  v_rec public.review_recommendation;
begin
  for r in
    select id, journal_id from public.manuscripts where status = 'under_review' limit 50
  loop
    select id into v_round from public.review_rounds where manuscript_id = r.id order by round_number desc limit 1;
    if v_round is not null then
      select public.review_round_completed(v_round) into v_completed;
      if v_completed then
        update public.manuscripts set status = 'reviews_complete', updated_at = now() where id = r.id;
      end if;
    end if;
  end loop;

  for r in
    select id from public.manuscripts where status = 'reviews_complete' limit 50
  loop
    select id into v_round from public.review_rounds where manuscript_id = r.id order by round_number desc limit 1;
    if v_round is not null then
      select public.calculate_review_recommendation(v_round) into v_rec;
      if v_rec != 'no_recommendation' then
        update public.manuscripts set status = 'decision_pending', updated_at = now() where id = r.id;
      end if;
    end if;
  end loop;
end;
$$;

-- ============================================================
-- Schedule pg_cron jobs (idempotent — unschedule first)
-- ============================================================

-- Helper to safely schedule (ignore if pg_cron not available)
do $$
begin
  -- Remove existing if any
  perform cron.unschedule('metademic-overdue-hourly');
exception when others then null;
end $$;

do $$
begin
  perform cron.unschedule('metademic-reminders-daily');
exception when others then null;
end $$;

do $$
begin
  perform cron.unschedule('metademic-stale-6h');
exception when others then null;
end $$;

do $$
begin
  perform cron.unschedule('metademic-jobs-5m');
exception when others then null;
end $$;

do $$
begin
  perform cron.unschedule('metademic-transition-10m');
exception when others then null;
end $$;

-- Schedule new (all times UTC)
select cron.schedule(
  'metademic-overdue-hourly',
  '0 * * * *',  -- every hour at :00
  $$select public.cron_mark_overdue();$$
);

select cron.schedule(
  'metademic-reminders-daily',
  '0 9 * * *',  -- daily 09:00 UTC
  $$select public.cron_send_reminders();$$
);

select cron.schedule(
  'metademic-stale-6h',
  '0 */6 * * *',  -- every 6 hours
  $$select public.cron_check_stale_submissions();$$
);

select cron.schedule(
  'metademic-jobs-5m',
  '*/5 * * * *',  -- every 5 minutes
  $$select public.cron_process_system_jobs();$$
);

select cron.schedule(
  'metademic-transition-10m',
  '*/10 * * * *',  -- every 10 minutes
  $$select public.cron_auto_transition();$$
);

-- Also schedule edge function invocations via pg_net (if you want cron-dispatcher to handle complex logic)
-- These call the Edge Function HTTP endpoint every hour
do $$
declare
  v_url text;
  v_key text;
begin
  begin
    v_url := current_setting('app.supabase_url', true);
    v_key := current_setting('app.supabase_service_role_key', true);
  exception when others then
    v_url := null;
  end;

  if v_url is not null then
    -- Use pg_net to call cron-dispatcher (optional, as fallback local functions already handle)
    perform cron.schedule(
      'metademic-edge-hourly',
      '30 * * * *',
      format($f$
        select net.http_post(
          url := %L || '/functions/v1/cron-dispatcher?job=overdue',
          headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || %L),
          body := '{}'::jsonb
        );
      $f$, v_url, v_key)
    );
  end if;
exception when others then
  raise notice 'pg_net edge cron not scheduled (pg_net not available or url not set)';
end $$;

commit;
