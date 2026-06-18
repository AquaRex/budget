-- Rework: unify bills/incomes into a single `entries` table and add per-month
-- amounts (`entry_amounts`) to support recurring AND one-time payments, plus a
-- year/month Excel-style grid.
--
-- Run this in the Supabase SQL Editor AFTER 0001_init.sql.
--
-- Effective amount for an entry in a given (year, month):
--   * if a row exists in entry_amounts -> that amount (override / one-time)
--   * else if the entry is recurring   -> entries.default_amount
--   * else                              -> empty (0)

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.entries (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind           text not null check (kind in ('bill', 'income')),
  name           text not null check (char_length(name) between 1 and 120),
  category       text,
  due_day        integer not null default 1 check (due_day between 1 and 31),
  is_recurring   boolean not null default true,
  default_amount numeric(12, 2) not null default 0 check (default_amount >= 0),
  is_active      boolean not null default true,
  created_at     timestamptz not null default now()
);

create table if not exists public.entry_amounts (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  entry_id  uuid not null references public.entries (id) on delete cascade,
  year      integer not null check (year between 2000 and 2100),
  month     integer not null check (month between 1 and 12),
  amount    numeric(12, 2) not null default 0 check (amount >= 0),
  unique (entry_id, year, month)
);

create index if not exists entries_user_id_idx on public.entries (user_id);
create index if not exists entry_amounts_entry_idx on public.entry_amounts (entry_id);
create index if not exists entry_amounts_year_idx on public.entry_amounts (year);

-- ---------------------------------------------------------------------------
-- Row Level Security (owner + MFA/aal2, same model as 0001)
-- ---------------------------------------------------------------------------

alter table public.entries enable row level security;
alter table public.entry_amounts enable row level security;

drop policy if exists "entries_owner" on public.entries;
create policy "entries_owner"
  on public.entries for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "entries_require_mfa" on public.entries;
create policy "entries_require_mfa"
  on public.entries as restrictive for all to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2')
  with check ((select auth.jwt() ->> 'aal') = 'aal2');

drop policy if exists "entry_amounts_owner" on public.entry_amounts;
create policy "entry_amounts_owner"
  on public.entry_amounts for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "entry_amounts_require_mfa" on public.entry_amounts;
create policy "entry_amounts_require_mfa"
  on public.entry_amounts as restrictive for all to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2')
  with check ((select auth.jwt() ->> 'aal') = 'aal2');

-- ---------------------------------------------------------------------------
-- Migrate any existing data from the old tables, then drop them.
-- ---------------------------------------------------------------------------

do $$
begin
  if to_regclass('public.bills') is not null then
    insert into public.entries
      (user_id, kind, name, category, due_day, is_recurring, default_amount, is_active, created_at)
    select user_id, 'bill', name, category, due_day, true, amount, is_active, created_at
    from public.bills;
    drop table public.bills;
  end if;

  if to_regclass('public.incomes') is not null then
    insert into public.entries
      (user_id, kind, name, category, due_day, is_recurring, default_amount, is_active, created_at)
    select user_id, 'income', name, null, expected_day, true, amount, is_active, created_at
    from public.incomes;
    drop table public.incomes;
  end if;
end $$;
