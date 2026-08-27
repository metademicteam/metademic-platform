-- SUPERSEDED by 20260828_payment_system_perfect.sql (payment_succeeded RPC) — this file kept for history
-- ============================================================
-- FIX v2.1: Stuck APC / invoice after Stripe payment succeeded
-- Run in Supabase SQL Editor (service_role / postgres).
-- Idempotent — safe to re-run.
-- v2.1 fix: v2 had nested DECLARE inside IF (PL/pgSQL syntax error)
-- so force_mark_manuscript_paid never created. Fixed here.
-- Also: diagnosis + force_* now work even when payments='pending'
-- (webhook missed) — forced path marks succeeded regardless.
-- ============================================================

begin;

create or replace view public.v_stuck_apc_diagnosis as
select
  i.id                as invoice_id,
  i.invoice_number,
  i.status            as invoice_status,
  i.amount,
  i.currency,
  a.id                as apc_id,
  a.status            as apc_status,
  a.manuscript_id,
  m.manuscript_number,
  m.title             as manuscript_title,
  m.status            as manuscript_status,
  p.id                as payment_id,
  p.provider,
  p.provider_payment_id,
  p.status            as payment_status,
  p.provider_event_id,
  ar.id               as article_id,
  pr.id               as production_id,
  pr.status           as production_status
from public.invoices i
join public.apcs a on a.id = i.apc_id
join public.manuscripts m on m.id = a.manuscript_id
left join lateral (
  select * from public.payments pp
  where pp.invoice_id = i.id
  order by pp.created_at desc limit 1
) p on true
left join public.articles ar on ar.manuscript_id = m.id
left join public.production_records pr on pr.article_id = ar.id
order by i.created_at desc;

create or replace function public._ensure_article_inline(p_manuscript_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_article_id uuid;
begin
  if exists (select 1 from pg_proc where proname = 'ensure_article_for_manuscript') then
    return public.ensure_article_for_manuscript(p_manuscript_id);
  end if;
  select id into v_article_id from public.articles where manuscript_id = p_manuscript_id limit 1;
  if v_article_id is not null then
    if not exists (select 1 from public.production_records where article_id = v_article_id) then
      insert into public.production_records (article_id, status) values (v_article_id, 'copyediting');
    end if;
    return v_article_id;
  end if;
  return null;
end; $$;

create or replace function public.force_mark_invoice_paid(
  p_invoice_id uuid,
  p_provider_payment_id text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_apc_id uuid;
  v_manuscript_id uuid;
  v_journal_id uuid;
  v_submitted_by uuid;
  v_invoice_status text;
  v_apc_status text;
  v_manu_status text;
  v_payment_id uuid;
  v_article_id uuid;
begin
  select i.apc_id, a.manuscript_id, i.status::text, a.status::text
    into v_apc_id, v_manuscript_id, v_invoice_status, v_apc_status
  from public.invoices i
  join public.apcs a on a.id = i.apc_id
  where i.id = p_invoice_id;

  if v_apc_id is null then
    return 'error: invoice not found: ' || p_invoice_id::text;
  end if;

  if v_invoice_status = 'paid' and v_apc_status = 'paid' then
    v_article_id := public._ensure_article_inline(v_manuscript_id);
    return 'already_paid: ' || p_invoice_id::text || ' article=' || coalesce(v_article_id::text,'null');
  end if;

  select status::text, journal_id, submitted_by
    into v_manu_status, v_journal_id, v_submitted_by
  from public.manuscripts where id = v_manuscript_id;

  if p_provider_payment_id is not null then
    select id into v_payment_id from public.payments
    where provider_payment_id = p_provider_payment_id limit 1;
  end if;
  if v_payment_id is null then
    select id into v_payment_id from public.payments
    where invoice_id = p_invoice_id
    order by created_at desc limit 1;
  end if;

  if v_payment_id is not null then
    update public.payments
      set status = 'succeeded',
          paid_at = coalesce(paid_at, now()),
          provider_event_id = coalesce(provider_event_id, 'fix_' || substr(md5(random()::text),1,12)),
          provider_payment_id = coalesce(p_provider_payment_id, provider_payment_id)
    where id = v_payment_id;
  else
    insert into public.payments (invoice_id, provider, provider_payment_id, amount, currency, status, paid_at, provider_event_id)
    select p_invoice_id, 'stripe', coalesce(p_provider_payment_id, 'fix_'||substr(md5(random()::text),1,12)),
           i.amount, i.currency, 'succeeded', now(), 'fix_'||substr(md5(random()::text),1,12)
    from public.invoices i where i.id = p_invoice_id
    returning id into v_payment_id;
  end if;

  update public.invoices set status = 'paid', paid_at = coalesce(paid_at, now()), updated_at = now()
  where id = p_invoice_id;

  update public.apcs set status = 'paid', paid_at = coalesce(paid_at, now()), updated_at = now()
  where id = v_apc_id;

  if v_manu_status in ('accepted','apc_pending') then
    update public.manuscripts set status = 'copyediting', updated_at = now()
    where id = v_manuscript_id;
    begin
      insert into public.workflow_events (manuscript_id, from_status, to_status, event_type, description)
      values (v_manuscript_id, v_manu_status::public.manuscript_status, 'copyediting', 'payment_succeeded', 'APC fixed via force_mark_invoice_paid — moved to copyediting');
    exception when others then null; end;
  end if;

  v_article_id := public._ensure_article_inline(v_manuscript_id);

  begin
    insert into public.system_jobs (job_type, entity_type, entity_id, status, payload)
    values ('payment_succeeded','manuscript', v_manuscript_id, 'completed', jsonb_build_object('invoice_id', p_invoice_id, 'fix', true));
  exception when others then null; end;

  begin
    if v_submitted_by is not null then
      insert into public.notifications (user_id, journal_id, manuscript_id, type, title, message, action_url)
      values (v_submitted_by, v_journal_id, v_manuscript_id, 'payment_received', 'Payment received', 'Your APC payment has been confirmed (repaired).', '/author/submissions/'||v_manuscript_id::text);
    end if;
  exception when others then null; end;

  begin
    insert into public.audit_logs (action, entity_type, entity_id, new_data)
    values ('payment.succeeded', 'invoice', p_invoice_id, jsonb_build_object('fix', true, 'providerPaymentId', p_provider_payment_id));
  exception when others then null; end;

  return 'fixed: invoice='||p_invoice_id::text||' apc='||v_apc_id::text||' manuscript='||v_manuscript_id::text||' -> copyediting article='||coalesce(v_article_id::text,'null');
end; $$;

-- FIXED: no nested DECLARE — valid PL/pgSQL
create or replace function public.force_mark_manuscript_paid(p_manuscript_number text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice_id uuid;
  v_apc_id uuid;
  v_inv uuid;
begin
  select i.id into v_invoice_id
  from public.invoices i
  join public.apcs a on a.id = i.apc_id
  join public.manuscripts m on m.id = a.manuscript_id
  where m.manuscript_number = p_manuscript_number
  order by i.created_at desc limit 1;

  if v_invoice_id is not null then
    return public.force_mark_invoice_paid(v_invoice_id);
  end if;

  select a.id into v_apc_id
  from public.apcs a
  join public.manuscripts m on m.id = a.manuscript_id
  where m.manuscript_number = p_manuscript_number
  order by a.created_at desc limit 1;

  if v_apc_id is null then
    return 'error: no APC for manuscript_number=' || p_manuscript_number;
  end if;

  select id into v_inv from public.invoices where apc_id = v_apc_id order by created_at desc limit 1;
  if v_inv is null then
    insert into public.invoices (apc_id, invoice_number, amount, currency, status, issued_at, due_at)
    select v_apc_id, 'INV-'||to_char(now(),'YYYYMMDD')||'-'||upper(substr(md5(random()::text),1,5)),
           total_amount, currency, 'issued', now(), now()+ interval '30 days'
    from public.apcs where id = v_apc_id returning id into v_inv;
  end if;
  return public.force_mark_invoice_paid(v_inv);
end; $$;

create or replace function public.repair_all_stuck_apcs()
returns table (invoice_id uuid, invoice_number text, result text)
language plpgsql
security definer
set search_path = public
as $$
declare r record;
begin
  for r in
    select i.id, i.invoice_number
    from public.invoices i
    join public.apcs a on a.id = i.apc_id
    where (i.status <> 'paid' or a.status <> 'paid')
      and exists (
        select 1 from public.manuscripts m
        where m.id = a.manuscript_id and m.status in ('accepted','apc_pending')
      )
  loop
    result := public.force_mark_invoice_paid(r.id);
    invoice_id := r.id;
    invoice_number := r.invoice_number;
    return next;
  end loop;
end; $$;

grant execute on function public.force_mark_invoice_paid(uuid, text) to authenticated, service_role;
grant execute on function public.force_mark_manuscript_paid(text) to authenticated, service_role;
grant execute on function public.repair_all_stuck_apcs() to authenticated, service_role;
grant select on public.v_stuck_apc_diagnosis to authenticated, service_role;

commit;

-- HOW TO USE:
-- select * from public.v_stuck_apc_diagnosis where apc_status <> 'paid' limit 20;
-- select public.force_mark_manuscript_paid('JRNL-2026-000123'::text);
-- select public.force_mark_invoice_paid('PASTE-INVOICE-UUID'::uuid);
-- select * from public.repair_all_stuck_apcs();
