-- ============================================================
-- Metademic Workflow Automation — Triggers & Functions
-- Automatic: author submit → reviewer notification → admin decision
-- Idempotent — safe to re-run
-- ============================================================

begin;

-- Ensure required extensions
create extension if not exists pgcrypto;
create extension if not exists pg_net with schema extensions;
-- pg_cron is managed separately (see 20260827_cron_jobs.sql)

-- ============================================================
-- Helper: notify journal roles
-- ============================================================

create or replace function public.notify_journal_roles(
  p_journal_id uuid,
  p_manuscript_id uuid,
  p_roles public.user_role[],
  p_type text,
  p_title text,
  p_message text,
  p_action_url text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  for r in
    select distinct user_id from public.journal_members
    where journal_id = p_journal_id
      and is_active = true
      and role = any(p_roles)
  loop
    insert into public.notifications (user_id, journal_id, manuscript_id, type, title, message, action_url)
    values (r.user_id, p_journal_id, p_manuscript_id, p_type, p_title, p_message, p_action_url);
  end loop;
end;
$$;

-- ============================================================
-- Main: manuscript status change handler
-- ============================================================

create or replace function public.handle_manuscript_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title text;
  v_number text;
begin
  if (TG_OP = 'UPDATE' and OLD.status = NEW.status) then
    return NEW;
  end if;

  v_title := coalesce(NEW.title, 'Untitled');
  v_number := NEW.manuscript_number;

  -- Insert workflow event if status changed
  if (TG_OP = 'UPDATE' and OLD.status is distinct from NEW.status) then
    insert into public.workflow_events (manuscript_id, actor_id, from_status, to_status, event_type, description)
    values (NEW.id, NEW.submitted_by, OLD.status, NEW.status, 'workflow.auto:status_change', 'Status ' || OLD.status::text || ' → ' || NEW.status::text)
    on conflict do nothing;
  end if;

  -- Route notifications by NEW.status
  case NEW.status
    when 'submitted' then
      -- Notify editors/admins to do technical check
      perform public.notify_journal_roles(
        NEW.journal_id, NEW.id,
        array['editor','section_editor','editor_in_chief','managing_editor','journal_manager','journal_admin','super_admin']::public.user_role[],
        'manuscript_submitted',
        'New submission: ' || v_number,
        'Manuscript "' || left(v_title, 80) || '" (' || v_number || ') has been submitted — technical check required.',
        '/editor/manuscripts/' || NEW.id
      );
      -- Confirm to author
      if NEW.submitted_by is not null then
        insert into public.notifications (user_id, journal_id, manuscript_id, type, title, message, action_url)
        values (NEW.submitted_by, NEW.journal_id, NEW.id, 'submission_received', 'Submission received', 'Your manuscript ' || v_number || ' has been received and is awaiting technical check.', '/author/submissions/' || NEW.id);
      end if;
      insert into public.system_jobs (job_type, entity_type, entity_id, status, payload)
      values ('technical_check', 'manuscript', NEW.id, 'pending', jsonb_build_object('manuscript_id', NEW.id, 'journal_id', NEW.journal_id));

    when 'technical_check' then
      perform public.notify_journal_roles(
        NEW.journal_id, NEW.id,
        array['managing_editor','journal_admin','super_admin']::public.user_role[],
        'technical_check',
        'Technical check required: ' || v_number,
        'Manuscript "' || left(v_title,80) || '" needs technical screening.',
        '/editor/manuscripts/' || NEW.id
      );

    when 'editor_assignment' then
      perform public.notify_journal_roles(
        NEW.journal_id, NEW.id,
        array['editor','editor_in_chief','section_editor']::public.user_role[],
        'editor_assignment',
        'Editor assignment pending: ' || v_number,
        'Manuscript "' || left(v_title,80) || '" awaits editor assignment.',
        '/editor/manuscripts/' || NEW.id
      );

    when 'reviewer_invitation' then
      -- Ensure review_round 1 exists
      if not exists (select 1 from public.review_rounds where manuscript_id = NEW.id and round_number = 1) then
        insert into public.review_rounds (manuscript_id, round_number, required_reviewers)
        values (NEW.id, 1, (select reviewers_required from public.journals where id = NEW.journal_id));
      end if;
      perform public.notify_journal_roles(
        NEW.journal_id, NEW.id,
        array['editor','editor_in_chief','managing_editor']::public.user_role[],
        'reviewer_invitation',
        'Invite reviewers: ' || v_number,
        'Manuscript "' || left(v_title,80) || '" is ready for reviewer invitations.',
        '/editor/manuscripts/' || NEW.id || '/reviewers'
      );

    when 'under_review' then
      -- Notify assigned reviewers (via review_assignments)
      insert into public.notifications (user_id, journal_id, manuscript_id, type, title, message, action_url)
      select rp.user_id, NEW.journal_id, NEW.id, 'review_started', 'Review started', 'Review for ' || v_number || ' has started. Deadline in ' || (select review_deadline_days from public.journals where id = NEW.journal_id) || ' days.', '/reviewer/reviews/' || ra.id
      from public.review_assignments ra
      join public.reviewer_profiles rp on rp.id = ra.reviewer_id
      join public.review_rounds rr on rr.id = ra.review_round_id
      where rr.manuscript_id = NEW.id and ra.status in ('accepted','reviewing');

    when 'reviews_complete' then
      perform public.notify_journal_roles(
        NEW.journal_id, NEW.id,
        array['editor','editor_in_chief','managing_editor','journal_admin']::public.user_role[],
        'reviews_complete',
        'Reviews complete: ' || v_number,
        'All reviews for "' || left(v_title,80) || '" are complete. System recommendation: ' || coalesce(public.calculate_review_recommendation((select id from public.review_rounds where manuscript_id = NEW.id order by round_number desc limit 1))::text, 'pending') || '. Please make a decision.',
        '/editor/manuscripts/' || NEW.id
      );

    when 'decision_pending' then
      perform public.notify_journal_roles(
        NEW.journal_id, NEW.id,
        array['editor','editor_in_chief']::public.user_role[],
        'decision_pending',
        'Decision pending: ' || v_number,
        'Manuscript "' || left(v_title,80) || '" awaits editorial decision.',
        '/editor/manuscripts/' || NEW.id
      );

    when 'minor_revision'::public.manuscript_status, 'major_revision'::public.manuscript_status then
      if NEW.submitted_by is not null then
        insert into public.notifications (user_id, journal_id, manuscript_id, type, title, message, action_url)
        values (
          NEW.submitted_by, NEW.journal_id, NEW.id,
          case NEW.status when 'minor_revision' then 'minor_revision' else 'major_revision' end,
          case NEW.status when 'minor_revision' then 'Minor revision requested' else 'Major revision requested' end || ': ' || v_number,
          'Your manuscript "' || left(v_title,80) || '" requires revision. Please address reviewer comments and resubmit.',
          '/author/submissions/' || NEW.id || '/revision'
        );
        insert into public.email_logs (user_id, manuscript_id, recipient_email, template_name, subject, status)
        select NEW.submitted_by, NEW.id, email, case NEW.status when 'minor_revision' then 'decision_minor_revision' else 'decision_major_revision' end, 'Revision requested: ' || v_number, 'queued'
        from public.profiles where id = NEW.submitted_by;
      end if;

    when 'accepted' then
      if NEW.submitted_by is not null then
        insert into public.notifications (user_id, journal_id, manuscript_id, type, title, message, action_url)
        values (NEW.submitted_by, NEW.journal_id, NEW.id, 'decision_accept', 'Manuscript accepted: ' || v_number, 'Your manuscript "' || left(v_title,80) || '" has been accepted. Next: APC and production.', '/author/submissions/' || NEW.id);
      end if;
      -- Auto-create APC if journal has APC enabled
      insert into public.apcs (manuscript_id, base_amount, total_amount, currency, status, calculated_at)
      select NEW.id, default_apc, default_apc, currency, 'calculated', now()
      from public.journals where id = NEW.journal_id and apc_enabled = true and default_apc > 0
      on conflict (manuscript_id) do nothing;
      -- Notify finance if APC
      if exists (select 1 from public.journals where id = NEW.journal_id and apc_enabled = true) then
        perform public.notify_journal_roles(
          NEW.journal_id, NEW.id,
          array['finance_admin','journal_admin','super_admin']::public.user_role[],
          'apc_required',
          'APC required: ' || v_number,
          'Manuscript "' || left(v_title,80) || '" accepted — APC invoice to be issued.',
          '/finance/invoices'
        );
      end if;

    when 'rejected' then
      if NEW.submitted_by is not null then
        insert into public.notifications (user_id, journal_id, manuscript_id, type, title, message, action_url)
        values (NEW.submitted_by, NEW.journal_id, NEW.id, 'decision_reject', 'Decision: rejected', 'Your manuscript ' || v_number || ' has been rejected.', '/author/submissions/' || NEW.id);
      end if;

    when 'published' then
      -- Notify author + create public notification
      if NEW.submitted_by is not null then
        insert into public.notifications (user_id, journal_id, manuscript_id, type, title, message, action_url)
        values (NEW.submitted_by, NEW.journal_id, NEW.id, 'article_published', 'Article published: ' || v_number, 'Your article "' || left(v_title,80) || '" is now published.', '/articles/' || (select slug from public.articles where manuscript_id = NEW.id limit 1));
      end if;
      insert into public.system_jobs (job_type, entity_type, entity_id, status, payload)
      values ('publication_notification', 'manuscript', NEW.id, 'pending', jsonb_build_object('manuscript_id', NEW.id));

    else
      -- no-op for other statuses
      null;
  end case;

  -- Always audit
  insert into public.audit_logs (actor_id, journal_id, manuscript_id, action, entity_type, entity_id, new_data)
  values (coalesce(NEW.submitted_by, NEW.assigned_editor_id), NEW.journal_id, NEW.id, 'manuscript.status.' || NEW.status::text, 'manuscript', NEW.id, jsonb_build_object('from', OLD.status, 'to', NEW.status));

  return NEW;
end;
$$;

drop trigger if exists trg_manuscript_status_change on public.manuscripts;
create trigger trg_manuscript_status_change
after insert or update of status on public.manuscripts
for each row execute function public.handle_manuscript_status_change();

-- ============================================================
-- Reviewer invitation → notify reviewer
-- ============================================================

create or replace function public.handle_reviewer_invitation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ms_id uuid;
  v_journal_id uuid;
  v_title text;
  v_number text;
  v_reviewer_user uuid;
  v_deadline timestamptz;
begin
  select m.id, m.journal_id, m.title, m.manuscript_number into v_ms_id, v_journal_id, v_title, v_number
  from public.review_rounds rr join public.manuscripts m on m.id = rr.manuscript_id
  where rr.id = NEW.review_round_id;

  select user_id into v_reviewer_user from public.reviewer_profiles where id = NEW.reviewer_id;
  select deadline_at into v_deadline from public.review_assignments where reviewer_id = NEW.reviewer_id and review_round_id = NEW.review_round_id limit 1;

  if v_reviewer_user is not null then
    insert into public.notifications (user_id, journal_id, manuscript_id, type, title, message, action_url)
    values (
      v_reviewer_user, v_journal_id, v_ms_id,
      'reviewer_invited',
      'Review invitation: ' || coalesce(v_number, left(v_title,40)),
      'You have been invited to review "' || left(coalesce(v_title,'Untitled'),80) || '" (' || coalesce(v_number,'') || '). Deadline: ' || coalesce(to_char(v_deadline,'YYYY-MM-DD'),'14 days') || '. Please accept/decline.',
      '/reviewer/invitations'
    );
    insert into public.email_logs (user_id, manuscript_id, recipient_email, template_name, subject, status)
    select v_reviewer_user, v_ms_id, email, 'reviewer_invited', 'Invitation to review: ' || coalesce(v_number, v_title), 'queued'
    from public.profiles where id = v_reviewer_user;
    insert into public.system_jobs (job_type, entity_type, entity_id, status, payload)
    values ('send_email', 'manuscript', v_ms_id, 'pending', jsonb_build_object('template','reviewer_invited','recipient', (select email from public.profiles where id = v_reviewer_user), 'manuscript_id', v_ms_id));
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_reviewer_invitation on public.reviewer_invitations;
create trigger trg_reviewer_invitation
after insert on public.reviewer_invitations
for each row execute function public.handle_reviewer_invitation();

-- Also for review_assignments direct invites
create or replace function public.handle_review_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ms_id uuid;
  v_journal_id uuid;
  v_title text;
  v_number text;
  v_user uuid;
begin
  if TG_OP = 'INSERT' then
    select m.id, m.journal_id, m.title, m.manuscript_number into v_ms_id, v_journal_id, v_title, v_number
    from public.review_rounds rr join public.manuscripts m on m.id = rr.manuscript_id
    where rr.id = NEW.review_round_id;
    select user_id into v_user from public.reviewer_profiles where id = NEW.reviewer_id;
    if v_user is not null and NEW.status = 'invited' then
      insert into public.notifications (user_id, journal_id, manuscript_id, type, title, message, action_url)
      values (v_user, v_journal_id, v_ms_id, 'reviewer_invited', 'Review invitation', 'You have been invited to review ' || coalesce(v_number, v_title), '/reviewer/invitations');
    end if;
    return NEW;
  elsif TG_OP = 'UPDATE' then
    -- When reviewer accepts/declines/completes, notify editors
    if OLD.status is distinct from NEW.status then
      select m.journal_id, m.manuscript_number into v_journal_id, v_number
      from public.review_rounds rr join public.manuscripts m on m.id = rr.manuscript_id
      where rr.id = NEW.review_round_id;

      if NEW.status = 'accepted' then
        perform public.notify_journal_roles(v_journal_id, (select manuscript_id from public.review_rounds where id = NEW.review_round_id), array['editor','editor_in_chief','managing_editor']::public.user_role[], 'reviewer_accepted', 'Reviewer accepted: ' || v_number, 'A reviewer has accepted the invitation for ' || v_number, '/editor/manuscripts/' || (select manuscript_id from public.review_rounds where id = NEW.review_round_id));
      elsif NEW.status = 'declined' then
        perform public.notify_journal_roles(v_journal_id, (select manuscript_id from public.review_rounds where id = NEW.review_round_id), array['editor','editor_in_chief']::public.user_role[], 'reviewer_declined', 'Reviewer declined: ' || v_number, 'A reviewer has declined. Please invite another.', '/editor/manuscripts/' || (select manuscript_id from public.review_rounds where id = NEW.review_round_id));
      elsif NEW.status = 'completed' then
        -- Check if round completed and auto-transition
        declare
          v_mid uuid;
          v_completed boolean;
        begin
          select manuscript_id into v_mid from public.review_rounds where id = NEW.review_round_id;
          select public.review_round_completed(NEW.review_round_id) into v_completed;
          if v_completed then
            update public.manuscripts set status = 'reviews_complete', updated_at = now() where id = v_mid and status = 'under_review';
            -- The manuscript status trigger will handle admin notification
          end if;
        end;
      end if;
    end if;
    return NEW;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_review_assignment_ins on public.review_assignments;
create trigger trg_review_assignment_ins
after insert on public.review_assignments
for each row execute function public.handle_review_assignment();

drop trigger if exists trg_review_assignment_upd on public.review_assignments;
create trigger trg_review_assignment_upd
after update of status on public.review_assignments
for each row execute function public.handle_review_assignment();

-- ============================================================
-- Editorial decision → notify author + auto APC + revision
-- ============================================================

create or replace function public.handle_editorial_decision()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ms_id uuid := NEW.manuscript_id;
  v_journal_id uuid;
  v_submitted_by uuid;
  v_title text;
  v_number text;
begin
  select journal_id, submitted_by, title, manuscript_number into v_journal_id, v_submitted_by, v_title, v_number
  from public.manuscripts where id = v_ms_id;

  -- Map decision to manuscript status (if not already)
  -- This is handled by the application, but we ensure notification
  if NEW.decision = 'accept' then
    -- Author notification handled by manuscript status trigger when it becomes accepted
    null;
  elsif NEW.decision in ('minor_revision','major_revision') then
    -- Create revision request if not exists
    if not exists (select 1 from public.revision_requests where manuscript_id = v_ms_id and revision_round = (select coalesce(max(revision_round),0)+1 from public.revision_requests where manuscript_id = v_ms_id)) then
      insert into public.revision_requests (manuscript_id, decision_id, revision_round, due_at, instructions)
      values (v_ms_id, NEW.id, (select coalesce(max(revision_round),0)+1 from public.revision_requests where manuscript_id = v_ms_id), now() + interval '21 days', coalesce(NEW.editor_reason, 'Please address reviewer comments.'));
    end if;
    perform public.notify_journal_roles(v_journal_id, v_ms_id, array['author']::public.user_role[], 'revision_requested', 'Revision requested', 'Revision requested for ' || v_number, '/author/submissions/' || v_ms_id);
  elsif NEW.decision = 'reject' or NEW.decision = 'desk_reject' then
    -- Update manuscript to rejected if not already
    update public.manuscripts set status = 'rejected', rejected_at = now() where id = v_ms_id and status not in ('rejected','published');
  end if;

  -- Audit
  insert into public.audit_logs (actor_id, journal_id, manuscript_id, action, entity_type, entity_id, new_data)
  values (NEW.editor_id, v_journal_id, v_ms_id, 'editorial.decision.' || NEW.decision::text, 'editorial_decision', NEW.id, jsonb_build_object('decision', NEW.decision, 'recommendation', NEW.system_recommendation));

  return NEW;
end;
$$;

drop trigger if exists trg_editorial_decision on public.editorial_decisions;
create trigger trg_editorial_decision
after insert on public.editorial_decisions
for each row execute function public.handle_editorial_decision();

-- ============================================================
-- Helper: auto-invoke edge function (optional, for heavy tasks)
-- Uses pg_net if available, otherwise just creates system_jobs
-- ============================================================

create or replace function public.invoke_workflow_engine(p_manuscript_id uuid, p_action text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_url text;
  v_key text;
begin
  -- Try to call edge function via pg_net if available
  begin
    v_url := current_setting('app.supabase_url', true);
    v_key := current_setting('app.supabase_service_role_key', true);
    if v_url is not null and v_key is not null then
      perform net.http_post(
        url := v_url || '/functions/v1/workflow-engine',
        headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
        body := jsonb_build_object('action', p_action, 'manuscript_id', p_manuscript_id)
      );
    end if;
  exception when others then
    -- Fallback: just create system_job for Next.js worker to pick up
    insert into public.system_jobs (job_type, entity_type, entity_id, status, payload)
    values ('workflow_' || p_action, 'manuscript', p_manuscript_id, 'pending', jsonb_build_object('manuscript_id', p_manuscript_id, 'action', p_action));
  end;
end;
$$;

commit;
