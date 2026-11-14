-- Bank connection (Enable Banking / PSD2) — STAGE 1: STAGING ONLY.
--
-- Raw bank data lands in its own tables, exactly as the bank sent it, and is
-- NEVER written to public.transactions. Nothing here reads, changes or deletes
-- an existing transaction. Moving data into transactions is a later, separate
-- step, once the raw data has been inspected.
--
-- Clients (the website) may only READ these tables. Every write goes through the
-- `bank` Edge Function (service role), which also enforces the 2-fetches-per-day
-- limit via bank_begin_fetch().
--
-- Run AFTER 0026_match_rules.sql, in the Supabase SQL Editor. Safe to re-run.

-- One row per "Connect bank" click; proves the redirect coming back from the
-- bank was started by this user (CSRF protection). Not readable by clients.
create table if not exists public.bank_auth_requests (
  state         uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  aspsp_name    text not null,
  aspsp_country text not null,
  redirect_url  text not null,
  created_at    timestamptz not null default now(),
  used_at       timestamptz
);

-- An authorised bank session (consent), as returned by Enable Banking.
create table if not exists public.bank_sessions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  session_id    text not null,
  aspsp_name    text not null,
  aspsp_country text not null,
  valid_until   timestamptz,
  accounts      jsonb not null default '[]'::jsonb, -- accounts as returned by POST /sessions
  raw           jsonb not null,                     -- the full POST /sessions response
  created_at    timestamptz not null default now(),
  revoked_at    timestamptz,
  constraint bank_sessions_unique unique (user_id, session_id)
);

-- One row per "Update" click. Only 'running' / 'ok' / 'partial' rows count
-- towards the daily limit, so a fetch that fails outright doesn't use it up.
create table if not exists public.bank_fetches (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  fetch_date  date not null default ((now() at time zone 'Europe/Oslo')::date),
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  status      text not null default 'running'
              check (status in ('running', 'ok', 'partial', 'error')),
  error       text,
  summary     jsonb not null default '{}'::jsonb -- per account: counts, details, balances
);

create index if not exists bank_fetches_user_date_idx
  on public.bank_fetches (user_id, fetch_date);

-- Raw transactions, byte-for-byte what the bank returned (as jsonb).
--   account_key : a stable id for the account across sessions (IBAN, or
--                 Enable Banking's identification_hash). `uid` changes per session.
--   raw_hash    : sha256 of the raw jsonb. Re-fetching an identical transaction
--                 just bumps seen_count / last_seen_at — it is never stored twice.
--                 A transaction whose content changes (e.g. pending -> booked)
--                 gets a NEW row, so we can see exactly how the bank changes data.
--   copies      : how many byte-identical copies the bank sent in one fetch
--                 (2 identical coffees the same day with no unique reference
--                 would show copies = 2 — important for the duplicate analysis).
create table if not exists public.bank_raw_transactions (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  session_id     text not null,
  account_uid    text not null,
  account_key    text not null,
  raw            jsonb not null,
  raw_hash       text not null,
  copies         int not null default 1,
  first_fetch_id uuid references public.bank_fetches (id) on delete set null,
  last_fetch_id  uuid references public.bank_fetches (id) on delete set null,
  first_seen_at  timestamptz not null default now(),
  last_seen_at   timestamptz not null default now(),
  seen_count     int not null default 1,
  constraint bank_raw_transactions_unique unique (user_id, account_key, raw_hash)
);

create index if not exists bank_raw_transactions_user_account_idx
  on public.bank_raw_transactions (user_id, account_key);

-- ---------------------------------------------------------------------------
-- RLS: owner can READ (at aal2 only). No insert/update/delete policies at all,
-- so the website can never write here; only the Edge Function (service role,
-- which bypasses RLS) can. bank_auth_requests has no policies: fully private.
-- ---------------------------------------------------------------------------
alter table public.bank_auth_requests    enable row level security;
alter table public.bank_sessions         enable row level security;
alter table public.bank_fetches          enable row level security;
alter table public.bank_raw_transactions enable row level security;

do $$
declare t text;
begin
  foreach t in array array['bank_sessions', 'bank_fetches', 'bank_raw_transactions'] loop
    execute format('drop policy if exists %I on public.%I', t || '_owner_read', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (user_id = (select auth.uid()))',
      t || '_owner_read', t);
    execute format('drop policy if exists %I on public.%I', t || '_require_mfa', t);
    execute format(
      'create policy %I on public.%I as restrictive for select to authenticated using ((select auth.jwt() ->> ''aal'') = ''aal2'')',
      t || '_require_mfa', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- bank_begin_fetch: atomically checks the daily limit and opens a fetch row.
-- Returns the new fetch id, or NULL when the limit is reached. A per-user lock
-- stops two simultaneous clicks from both slipping under the limit. A 'running'
-- row older than 15 minutes (a crashed function) no longer counts.
-- ---------------------------------------------------------------------------
create or replace function public.bank_begin_fetch(p_user_id uuid, p_limit int)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Europe/Oslo')::date;
  v_used  int;
  v_id    uuid;
begin
  perform pg_advisory_xact_lock(hashtext('bank_fetch:' || p_user_id::text));

  select count(*) into v_used
  from public.bank_fetches
  where user_id = p_user_id
    and fetch_date = v_today
    and (status in ('ok', 'partial')
         or (status = 'running' and started_at > now() - interval '15 minutes'));

  if v_used >= p_limit then
    return null;
  end if;

  insert into public.bank_fetches (user_id, fetch_date)
  values (p_user_id, v_today)
  returning id into v_id;
  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- bank_stage_transactions: store one account's raw transactions from one fetch.
-- Insert-or-touch only: an existing row's `raw` is never modified or deleted.
-- Returns how many distinct raw rows were new vs. already known.
-- ---------------------------------------------------------------------------
create or replace function public.bank_stage_transactions(
  p_user_id     uuid,
  p_fetch_id    uuid,
  p_session_id  text,
  p_account_uid text,
  p_account_key text,
  p_rows        jsonb
)
returns table (inserted int, known int)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with input as (
    select value as raw,
           encode(sha256(convert_to(value::text, 'UTF8')), 'hex') as h
    from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb))
  ),
  grouped as (
    select h, (array_agg(raw))[1] as raw, count(*)::int as n
    from input
    group by h
  ),
  up as (
    insert into public.bank_raw_transactions as t
      (user_id, session_id, account_uid, account_key, raw, raw_hash, copies,
       first_fetch_id, last_fetch_id)
    select p_user_id, p_session_id, p_account_uid, p_account_key, g.raw, g.h, g.n,
           p_fetch_id, p_fetch_id
    from grouped g
    on conflict (user_id, account_key, raw_hash) do update
      set last_seen_at  = now(),
          seen_count    = t.seen_count + 1,
          last_fetch_id = excluded.last_fetch_id,
          copies        = greatest(t.copies, excluded.copies)
    returning (xmax = 0) as is_new
  )
  select count(*) filter (where is_new)::int,
         count(*) filter (where not is_new)::int
  from up;
end $$;

-- Only the Edge Function (service role) may call these.
revoke all on function public.bank_begin_fetch(uuid, int) from public, anon, authenticated;
revoke all on function public.bank_stage_transactions(uuid, uuid, text, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.bank_begin_fetch(uuid, int) to service_role;
grant execute on function public.bank_stage_transactions(uuid, uuid, text, text, text, jsonb)
  to service_role;

notify pgrst, 'reload schema';
