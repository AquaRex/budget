-- Bank connection — STAGE 2: bank data feeds the transaction list.
--
-- Adds only; changes no existing row and removes nothing:
--   * transactions.source        'csv' (all existing rows) or 'bank'
--   * csv_raw_rows               every CSV import's parsed rows, kept forever
--                                (the CSV counterpart of bank_raw_transactions),
--                                so both sources survive as backups and can be
--                                compared for discrepancies over time
--   * bank_fetches.trigger       'manual' (button, max 3/day) or 'auto' (daily)
--
-- Run AFTER 0027_bank_staging.sql, in the Supabase SQL Editor. Safe to re-run.

-- --------------------------------------------------------------------------
-- Where a transaction row came from. Existing rows are all CSV imports.
alter table public.transactions
  add column if not exists source text not null default 'csv';
do $$ begin
  alter table public.transactions
    add constraint transactions_source_check check (source in ('csv', 'bank'));
exception when duplicate_object then null; end $$;

-- --------------------------------------------------------------------------
-- Raw CSV rows, append-only. One row per line per import.
create table if not exists public.csv_raw_rows (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  import_id  uuid references public.imports (id) on delete set null,
  line_no    int not null,
  row        jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists csv_raw_rows_user_idx on public.csv_raw_rows (user_id, import_id);

alter table public.csv_raw_rows enable row level security;
drop policy if exists "csv_raw_rows_owner_read" on public.csv_raw_rows;
create policy "csv_raw_rows_owner_read" on public.csv_raw_rows for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists "csv_raw_rows_owner_insert" on public.csv_raw_rows;
create policy "csv_raw_rows_owner_insert" on public.csv_raw_rows for insert to authenticated
  with check (user_id = (select auth.uid()));
-- No update/delete policies: once stored, a raw CSV row is never changed.
drop policy if exists "csv_raw_rows_require_mfa" on public.csv_raw_rows;
create policy "csv_raw_rows_require_mfa" on public.csv_raw_rows as restrictive for all to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2')
  with check ((select auth.jwt() ->> 'aal') = 'aal2');

-- --------------------------------------------------------------------------
-- Manual (button) vs automatic (daily) fetches, with separate limits:
-- 3 manual + 1 automatic = the bank's 4 per day.
alter table public.bank_fetches
  add column if not exists trigger text not null default 'manual';
do $$ begin
  alter table public.bank_fetches
    add constraint bank_fetches_trigger_check check (trigger in ('manual', 'auto'));
exception when duplicate_object then null; end $$;

create or replace function public.bank_begin_fetch_v2(p_user_id uuid, p_trigger text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Europe/Oslo')::date;
  v_limit int := case when p_trigger = 'auto' then 1 else 3 end;
  v_used  int;
  v_id    uuid;
begin
  if p_trigger not in ('manual', 'auto') then
    raise exception 'bad trigger %', p_trigger;
  end if;
  perform pg_advisory_xact_lock(hashtext('bank_fetch:' || p_user_id::text));

  select count(*) into v_used
  from public.bank_fetches
  where user_id = p_user_id
    and fetch_date = v_today
    and trigger = p_trigger
    and (status in ('ok', 'partial')
         or (status = 'running' and started_at > now() - interval '15 minutes'));

  if v_used >= v_limit then
    return null;
  end if;

  insert into public.bank_fetches (user_id, fetch_date, trigger)
  values (p_user_id, v_today, p_trigger)
  returning id into v_id;
  return v_id;
end $$;

revoke all on function public.bank_begin_fetch_v2(uuid, text) from public, anon, authenticated;
grant execute on function public.bank_begin_fetch_v2(uuid, text) to service_role;

notify pgrst, 'reload schema';
