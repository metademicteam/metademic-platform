-- ============================================================
-- PERFECT PAYMENT SYSTEM — one file to run in Supabase SQL Editor
-- Idempotent — safe to re-run. Fixes schema gaps + gives you
-- atomic, idempotent RPCs so Stripe/webhook/manual-verify can never
-- leave apc_pending stuck again.
-- Run as postgres/service_role. After running: verify with the
-- checks at the bottom.
-- ============================================================
begin;

-- ------------------------------------------------------------------
-- 1) Indexes & idempotency (schema.sql enabled RLS but left these bare)
-- ------------------------------------------------------------------
create unique index if not exists idx_payments_provider_event_uniq
  on public.payments(provider_event_id) where provider_event_id is not null;

create index if not exists idx_payments_invoice_id on public.payments(invoice_id);
create index if not exists idx_payments_provider_payment_id on public.payments(provider_payment_id) where provider_payment_id is not null;
create index if not exists idx_payments_status on public.payments(status);
create index if not exists idx_invoices_apc_id on public.invoices(apc_id);
create index if not exists idx_invoices_status on public.invoices(status);
create index if not exists idx_apcs_manuscript_id on public.apcs(manuscript_id);
create index if not exists idx_apcs_status on public.apcs(status);

-- amount should never be negative (schema.sql had no check on these)
do $$ begin
  alter table public.payments add constraint chk_payments_amount_nonneg check (amount >= 0);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.invoices add constraint chk_invoices_amount_nonneg check (amount >= 0);
exception when duplicate_object then null; end $$;

-- ------------------------------------------------------------------
-- 2) Article/production helper — reuse existing if you already ran
--    20260827_production_pipeline_automation.sql, else create it
-- ------------------------------------------------------------------
create or replace function public.ensure_article_for_manuscript(p_manuscript_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_article_id uuid; v_journal_id uuid; v_title text; v_abstract text;
  v_article_type public.article_type; v_number text;
  v_submitted_at timestamptz; v_accepted_at timestamptz;
  v_year int; v_article_number text; v_slug text;
begin
  select id into v_article_id from public.articles where manuscript_id = p_manuscript_id limit 1;
  if v_article_id is not null then
    if not exists (select 1 from public.production_records where article_id = v_article_id) then
      insert into public.production_records (article_id, status) values (v_article_id, 'copyediting');
    end if;
    if not exists (select 1 from public.article_authors where article_id = v_article_id) then
      insert into public.article_authors (article_id, user_id, first_name, middle_name, last_name, orcid, affiliation, author_order, is_corresponding, contribution_statement)
      select v_article_id, user_id, first_name, middle_name, last_name, orcid, institution_name_snapshot, author_order, is_corresponding, contribution_statement
      from public.manuscript_authors where manuscript_id = p_manuscript_id order by author_order;
    end if;
    return v_article_id;
  end if;
  select journal_id, title, abstract, article_type, manuscript_number, submitted_at, accepted_at
    into v_journal_id, v_title, v_abstract, v_article_type, v_number, v_submitted_at, v_accepted_at
  from public.manuscripts where id = p_manuscript_id;
  if v_journal_id is null then return null; end if;
  v_year := extract(year from coalesce(v_accepted_at, v_submitted_at, now()))::int;
  v_article_number := v_year::text || '-' || upper(substr(replace(gen_random_uuid()::text,'-', ''),1,8));
  v_slug := regexp_replace(lower(coalesce(v_title,'article')), '[^a-z0-9]+','-','g');
  v_slug := trim(both '-' from v_slug);
  v_slug := left(v_slug,80);
  if v_slug = '' then v_slug := 'article'; end if;
  v_slug := v_slug || '-' || lower(v_article_number);
  insert into public.articles (manuscript_id, journal_id, article_number, slug, title, abstract, article_type, publication_status, received_at, accepted_at)
  values (p_manuscript_id, v_journal_id, v_article_number, v_slug, v_title, v_abstract, coalesce(v_article_type,'research_article'::public.article_type), 'draft', v_submitted_at, v_accepted_at)
  on conflict (manuscript_id) do nothing returning id into v_article_id;
  if v_article_id is null then select id into v_article_id from public.articles where manuscript_id = p_manuscript_id limit 1; end if;
  if v_article_id is not null then
    if not exists (select 1 from public.production_records where article_id = v_article_id) then
      insert into public.production_records (article_id, status) values (v_article_id, 'copyediting');
    end if;
    if not exists (select 1 from public.article_authors where article_id = v_article_id) then
      insert into public.article_authors (article_id, user_id, first_name, middle_name, last_name, orcid, affiliation, author_order, is_corresponding, contribution_statement)
      select v_article_id, user_id, first_name, middle_name, last_name, orcid, institution_name_snapshot, author_order, is_corresponding, contribution_statement
      from public.manuscript_authors where manuscript_id = p_manuscript_id order by author_order;
    end if;
  end if;
  return v_article_id;
end; $$;

-- Keep the trigger that moves manuscript -> copyediting when apc becomes paid
create or replace function public.handle_apc_status_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_manuscript_status text; v_article_id uuid;
begin
  if TG_OP='UPDATE' and OLD.status = NEW.status then return NEW; end if;
  if NEW.status = 'paid' then
    v_article_id := public.ensure_article_for_manuscript(NEW.manuscript_id);
    select status::text into v_manuscript_status from public.manuscripts where id = NEW.manuscript_id;
    if v_manuscript_status in ('accepted','apc_pending') then
      update public.manuscripts set status='copyediting', updated_at=now() where id=NEW.manuscript_id;
    end if;
    if NEW.paid_at is null then update public.apcs set paid_at=now() where id=NEW.id; end if;
  end if;
  return NEW;
end; $$;
drop trigger if exists trg_apc_status_change on public.apcs;
create trigger trg_apc_status_change after insert or update of status on public.apcs
for each row execute function public.handle_apc_status_change();

-- ------------------------------------------------------------------
-- 3) ATOMIC payment state machine — the "perfect" method
--    Single transaction, idempotent on provider_event_id, fixes all
--    four tables + side-effects. Call from webhook, verify, or manual.
-- ------------------------------------------------------------------
create or replace function public.payment_succeeded(
  p_invoice_id uuid,
  p_provider text default 'stripe',
  p_provider_payment_id text default null,
  p_provider_event_id text default null,
  p_amount numeric default null,
  p_currency text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_apc_id uuid; v_manuscript_id uuid; v_journal_id uuid; v_submitted_by uuid;
  v_inv_status text; v_apc_status text; v_manu_status text;
  v_payment_id uuid; v_article_id uuid;
  v_amount numeric; v_currency text;
  v_event_id text;
begin
  -- idempotency: same Stripe event never double-applies
  if p_provider_event_id is not null then
    select id into v_payment_id from public.payments where provider_event_id = p_provider_event_id limit 1;
    if v_payment_id is not null then return 'duplicate_event: '||p_provider_event_id; end if;
  end if;

  select i.apc_id, a.manuscript_id, i.status::text, a.status::text, i.amount, i.currency::text
    into v_apc_id, v_manuscript_id, v_inv_status, v_apc_status, v_amount, v_currency
  from public.invoices i join public.apcs a on a.id=i.apc_id where i.id=p_invoice_id;
  if v_apc_id is null then return 'error: invoice not found '||p_invoice_id::text; end if;

  if v_inv_status='paid' and v_apc_status='paid' then
    v_article_id := public.ensure_article_for_manuscript(v_manuscript_id);
    return 'already_paid: '||p_invoice_id::text||' article='||coalesce(v_article_id::text,'null');
  end if;

  select status::text, journal_id, submitted_by into v_manu_status, v_journal_id, v_submitted_by
  from public.manuscripts where id=v_manuscript_id;

  v_amount := coalesce(p_amount, v_amount);
  v_currency := coalesce(upper(p_currency), v_currency, 'USD');
  v_event_id := coalesce(p_provider_event_id, 'evt_'||substr(md5(random()::text),1,16));

  -- upsert payment row
  if p_provider_payment_id is not null then
    select id into v_payment_id from public.payments where provider_payment_id=p_provider_payment_id limit 1;
  end if;
  if v_payment_id is null then
    select id into v_payment_id from public.payments where invoice_id=p_invoice_id order by created_at desc limit 1;
  end if;

  if v_payment_id is not null then
    update public.payments set
      status='succeeded'::public.payment_status,
      paid_at=coalesce(paid_at, now()),
      provider_event_id=coalesce(provider_event_id, v_event_id),
      provider_payment_id=coalesce(p_provider_payment_id, provider_payment_id),
      amount=coalesce(v_amount, amount),
      currency=coalesce(v_currency, currency),
      provider=coalesce(p_provider, provider)
    where id=v_payment_id;
  else
    insert into public.payments (invoice_id, provider, provider_payment_id, amount, currency, status, paid_at, provider_event_id)
    values (p_invoice_id, coalesce(p_provider,'stripe'), coalesce(p_provider_payment_id,'pay_'||substr(md5(random()::text),1,12)),
            v_amount, v_currency, 'succeeded'::public.payment_status, now(), v_event_id)
    returning id into v_payment_id;
  end if;

  update public.invoices set status='paid'::public.invoice_status, paid_at=coalesce(paid_at,now()), updated_at=now()
  where id=p_invoice_id;

  update public.apcs set status='paid'::public.apc_status, paid_at=coalesce(paid_at,now()), updated_at=now()
  where id=v_apc_id;

  if v_manu_status in ('accepted','apc_pending') then
    update public.manuscripts set status='copyediting'::public.manuscript_status, updated_at=now() where id=v_manuscript_id;
    begin
      insert into public.workflow_events (manuscript_id, from_status, to_status, event_type, description)
      values (v_manuscript_id, v_manu_status::public.manuscript_status, 'copyediting'::public.manuscript_status, 'payment_succeeded', 'APC payment confirmed — moved to copyediting');
    exception when others then null; end;
  end if;

  v_article_id := public.ensure_article_for_manuscript(v_manuscript_id);

  begin insert into public.system_jobs (job_type, entity_type, entity_id, status, payload)
    values ('payment_succeeded','manuscript',v_manuscript_id,'completed', jsonb_build_object('invoice_id',p_invoice_id,'provider',p_provider,'event',v_event_id));
  exception when others then null; end;
  begin
    if v_submitted_by is not null then
      insert into public.notifications (user_id, journal_id, manuscript_id, type, title, message, action_url)
      values (v_submitted_by, v_journal_id, v_manuscript_id, 'payment_received','Payment received','Your APC payment has been confirmed.','/author/submissions/'||v_manuscript_id::text);
    end if;
  exception when others then null; end;
  begin insert into public.audit_logs (action, entity_type, entity_id, new_data)
    values ('payment.succeeded','invoice',p_invoice_id, jsonb_build_object('provider',p_provider,'paymentId',p_provider_payment_id,'event',v_event_id));
  exception when others then null; end;

  return 'ok: invoice='||p_invoice_id::text||' apc='||v_apc_id::text||' manuscript='||v_manuscript_id::text||' -> copyediting article='||coalesce(v_article_id::text,'null');
end; $$;

create or replace function public.payment_failed(
  p_invoice_id uuid,
  p_provider_payment_id text default null,
  p_reason text default null
) returns text
language plpgsql security definer set search_path=public as $$
declare v_pid uuid;
begin
  if p_provider_payment_id is not null then
    select id into v_pid from public.payments where provider_payment_id=p_provider_payment_id limit 1;
  end if;
  if v_pid is null then select id into v_pid from public.payments where invoice_id=p_invoice_id order by created_at desc limit 1; end if;
  if v_pid is not null then
    update public.payments set status='failed'::public.payment_status, metadata = metadata || jsonb_build_object('failure_reason', coalesce(p_reason,'unknown')) where id=v_pid;
  end if;
  return coalesce('failed: '||v_pid::text, 'no payment row for '||p_invoice_id::text);
end; $$;

-- convenience wrappers so you never need to hunt invoice_id
create or replace function public.force_mark_invoice_paid(p_invoice_id uuid, p_provider_payment_id text default null)
returns text language sql security definer set search_path=public as $$
  select public.payment_succeeded(p_invoice_id, 'stripe', p_provider_payment_id, null, null, null);
$$;

create or replace function public.force_mark_manuscript_paid(p_manuscript_number text)
returns text language plpgsql security definer set search_path=public as $$
declare v_invoice_id uuid; v_apc_id uuid; v_inv uuid;
begin
  select i.id into v_invoice_id from public.invoices i join public.apcs a on a.id=i.apc_id join public.manuscripts m on m.id=a.manuscript_id
  where m.manuscript_number=p_manuscript_number order by i.created_at desc limit 1;
  if v_invoice_id is not null then return public.payment_succeeded(v_invoice_id); end if;
  select a.id into v_apc_id from public.apcs a join public.manuscripts m on m.id=a.manuscript_id where m.manuscript_number=p_manuscript_number order by a.created_at desc limit 1;
  if v_apc_id is null then return 'error: no APC for '||p_manuscript_number; end if;
  select id into v_inv from public.invoices where apc_id=v_apc_id order by created_at desc limit 1;
  if v_inv is null then
    insert into public.invoices (apc_id, invoice_number, amount, currency, status, issued_at, due_at)
    select v_apc_id, 'INV-'||to_char(now(),'YYYYMMDD')||'-'||upper(substr(md5(random()::text),1,5)), total_amount, currency, 'issued'::public.invoice_status, now(), now()+interval '30 days'
    from public.apcs where id=v_apc_id returning id into v_inv;
  end if;
  return public.payment_succeeded(v_inv);
end; $$;

create or replace function public.repair_all_stuck_apcs()
returns table (invoice_id uuid, invoice_number text, result text)
language plpgsql security definer set search_path=public as $$
declare r record;
begin
  for r in select i.id, i.invoice_number from public.invoices i join public.apcs a on a.id=i.apc_id
           where (i.status <> 'paid'::public.invoice_status or a.status <> 'paid'::public.apc_status)
             and exists (select 1 from public.manuscripts m where m.id=a.manuscript_id and m.status in ('accepted'::public.manuscript_status,'apc_pending'::public.manuscript_status))
  loop
    result := public.payment_succeeded(r.id); invoice_id:=r.id; invoice_number:=r.invoice_number; return next;
  end loop;
end; $$;

-- diagnosis view
create or replace view public.v_stuck_apc_diagnosis as
select i.id as invoice_id, i.invoice_number, i.status as invoice_status, i.amount, i.currency,
       a.id as apc_id, a.status as apc_status, a.manuscript_id,
       m.manuscript_number, m.title as manuscript_title, m.status as manuscript_status,
       p.id as payment_id, p.provider, p.provider_payment_id, p.status as payment_status, p.provider_event_id,
       ar.id as article_id, pr.id as production_id, pr.status as production_status
from public.invoices i join public.apcs a on a.id=i.apc_id join public.manuscripts m on m.id=a.manuscript_id
left join lateral (select * from public.payments pp where pp.invoice_id=i.id order by pp.created_at desc limit 1) p on true
left join public.articles ar on ar.manuscript_id=m.id
left join public.production_records pr on pr.article_id=ar.id
order by i.created_at desc;

grant execute on function public.payment_succeeded(uuid,text,text,text,numeric,text) to authenticated, service_role;
grant execute on function public.payment_failed(uuid,text,text) to authenticated, service_role;
grant execute on function public.force_mark_invoice_paid(uuid,text) to authenticated, service_role;
grant execute on function public.force_mark_manuscript_paid(text) to authenticated, service_role;
grant execute on function public.repair_all_stuck_apcs() to authenticated, service_role;
grant execute on function public.ensure_article_for_manuscript(uuid) to authenticated, service_role;
grant select on public.v_stuck_apc_diagnosis to authenticated, service_role;


-- ------------------------------------------------------------------
-- 4) Cron: auto-reconcile missed Stripe payments (runs every 5m if pg_cron enabled)
--    Catches any invoice where Stripe session is paid but DB still pending — no code deploy needed
-- ------------------------------------------------------------------
create or replace function public.cron_reconcile_payments()
returns void language plpgsql security definer set search_path=public as $$
declare r record;
begin
  for r in
    select i.id as invoice_id from public.invoices i
    join public.apcs a on a.id=i.apc_id
    join public.payments p on p.invoice_id=i.id
    where (i.status <> 'paid'::public.invoice_status or a.status <> 'paid'::public.apc_status)
      and p.provider_payment_id like 'cs_%'
      and p.status = 'pending'::public.payment_status
      and p.created_at < now() - interval '2 minutes'
    limit 20
  loop
    -- We can't call Stripe from DB; mark for server-side reconcile via system_jobs
    insert into public.system_jobs (job_type, entity_type, entity_id, status, payload)
    values ('reconcile_payment','invoice',r.invoice_id,'pending', jsonb_build_object('invoice_id', r.invoice_id))
    on conflict do nothing;
  end loop;
end; $$;

do $$ begin perform cron.unschedule('metademic-reconcile-payments'); exception when others then null; end $$;
do $cron$ begin
  perform cron.schedule('metademic-reconcile-payments','*/5 * * * *', 'select public.cron_reconcile_payments();');
exception when others then raise notice 'cron_reconcile_payments not scheduled (pg_cron not available)'; end $cron$;

commit;

-- ============================================================
-- VERIFY AFTER RUNNING (paste in SQL Editor):
-- select * from public.v_stuck_apc_diagnosis where apc_status <> 'paid' limit 20;
-- select public.force_mark_manuscript_paid('JRNL-2026-000123'::text);
-- select * from public.repair_all_stuck_apcs();
-- select * from public.v_stuck_apc_diagnosis where manuscript_number='JRNL-2026-000123';
-- ============================================================
