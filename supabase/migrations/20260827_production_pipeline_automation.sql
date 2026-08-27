-- ============================================================
-- Metademic Production Pipeline Automation — Triggers & Functions
-- Automatic: APC paid → article + production record → publish article
-- Idempotent — safe to re-run
-- ============================================================

begin;

-- ============================================================
-- Helper: ensure an article (and production record) exists for a manuscript.
-- Used when the APC is paid and production should begin.
-- ============================================================

create or replace function public.ensure_article_for_manuscript(p_manuscript_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_article_id uuid;
  v_journal_id uuid;
  v_title text;
  v_abstract text;
  v_article_type public.article_type;
  v_number text;
  v_submitted_at timestamptz;
  v_accepted_at timestamptz;
  v_year int;
  v_article_number text;
  v_slug text;
begin
  -- Already have an article? Ensure a production record and authors exist and return it.
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
  from public.manuscripts
  where id = p_manuscript_id;
  if v_journal_id is null then
    return null; -- manuscript not found
  end if;

  v_year := extract(year from coalesce(v_accepted_at, v_submitted_at, now()))::int;
  v_article_number := v_year::text || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  -- Slugify the title (lowercase, non-alphanumeric -> dash), trim leading/trailing dashes,
  -- then append a short suffix for uniqueness.
  v_slug := regexp_replace(lower(coalesce(v_title, 'article')), '[^a-z0-9]+', '-', 'g');
  v_slug := trim(both '-' from v_slug);
  v_slug := left(v_slug, 80);
  if v_slug = '' then v_slug := 'article'; end if;
  v_slug := v_slug || '-' || lower(v_article_number);

  insert into public.articles (manuscript_id, journal_id, article_number, slug, title, abstract, article_type, publication_status, received_at, accepted_at)
  values (p_manuscript_id, v_journal_id, v_article_number, v_slug, v_title, v_abstract, coalesce(v_article_type, 'research_article'::public.article_type), 'draft', v_submitted_at, v_accepted_at)
  on conflict (manuscript_id) do nothing
  returning id into v_article_id;

  if v_article_id is null then
    select id into v_article_id from public.articles where manuscript_id = p_manuscript_id limit 1;
  end if;

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
end;
$$;

-- ============================================================
-- APC → paid: move manuscript to production (copyediting)
-- ============================================================

create or replace function public.handle_apc_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_manuscript_status text;
  v_article_id uuid;
begin
  if TG_OP = 'UPDATE' and OLD.status = NEW.status then
    return NEW;
  end if;

  -- Only act when the APC becomes paid
  if NEW.status = 'paid' then
    -- Ensure article + production record exist
    v_article_id := public.ensure_article_for_manuscript(NEW.manuscript_id);

    -- Move manuscript into production if it is not already past the payable stage.
    select status into v_manuscript_status from public.manuscripts where id = NEW.manuscript_id;
    if v_manuscript_status in ('accepted', 'apc_pending') then
      update public.manuscripts
        set status = 'copyediting', updated_at = now()
      where id = NEW.manuscript_id;
    end if;

    if NEW.paid_at is null then
      update public.apcs set paid_at = now() where id = NEW.id;
    end if;
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_apc_status_change on public.apcs;
create trigger trg_apc_status_change
after insert or update of status on public.apcs
for each row execute function public.handle_apc_status_change();

-- ============================================================
-- Production record → published: publish the article + manuscript
-- ============================================================

create or replace function public.handle_production_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_manuscript_id uuid;
  v_slug text;
begin
  if TG_OP = 'UPDATE' and OLD.status = NEW.status then
    return NEW;
  end if;

  -- Only act when production reaches published
  if NEW.status = 'published' then
    select manuscript_id into v_manuscript_id from public.articles where id = NEW.article_id;

    -- Always keep the article row in sync so it shows in the public registry.
    update public.articles
      set publication_status = 'published',
          published_at = coalesce(published_at, now()),
          updated_at = now()
    where id = NEW.article_id;

    if v_manuscript_id is not null then
      update public.manuscripts
        set status = 'published', updated_at = now()
      where id = v_manuscript_id;
    end if;
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_production_status_change on public.production_records;
create trigger trg_production_status_change
after insert or update of status on public.production_records
for each row execute function public.handle_production_status_change();

-- ============================================================
-- Manuscript → published: also publish the linked article (belt-and-braces)
-- ============================================================

create or replace function public.handle_manuscript_published()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_article_id uuid;
begin
  if TG_OP = 'UPDATE' and OLD.status = NEW.status then
    return NEW;
  end if;

  if NEW.status = 'published' then
    select id into v_article_id from public.articles where manuscript_id = NEW.id limit 1;
    if v_article_id is not null then
      update public.articles
        set publication_status = 'published',
            published_at = coalesce(published_at, now()),
            updated_at = now()
      where id = v_article_id;
    end if;
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_manuscript_published on public.manuscripts;
create trigger trg_manuscript_published
after update of status on public.manuscripts
for each row execute function public.handle_manuscript_published();

commit;
