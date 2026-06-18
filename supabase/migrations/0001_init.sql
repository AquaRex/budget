-- Budget Tracker schema + Row Level Security.
-- Run this in the Supabase SQL Editor for project ecqrqrlupxgaulhpuclf.
--
-- Security model: the anon key is public (shipped to the browser). Data is
-- protected by RLS. Each row is owned by a user (user_id = auth.uid()), AND a
-- *restrictive* policy requires assurance level aal2, which is only reached
-- after the user passes TOTP 2FA. Without an MFA-verified session, every query
-- returns zero rows.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.bills (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 120),
  amount     numeric(12, 2) not null default 0 check (amount >= 0),
  category   text,
  due_day    integer not null default 1 check (due_day between 1 and 31),
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.incomes (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name         text not null check (char_length(name) between 1 and 120),
  amount       numeric(12, 2) not null default 0 check (amount >= 0),
  expected_day integer not null default 1 check (expected_day between 1 and 31),
  is_active    boolean not null default true,
  created_at   timestamptz not null default now()
);

create index if not exists bills_user_id_idx on public.bills (user_id);
create index if not exists incomes_user_id_idx on public.incomes (user_id);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.bills enable row level security;
alter table public.incomes enable row level security;

-- Permissive: a user can only touch their own rows.
drop policy if exists "bills_owner" on public.bills;
create policy "bills_owner"
  on public.bills
  for all
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "incomes_owner" on public.incomes;
create policy "incomes_owner"
  on public.incomes
  for all
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Restrictive: require MFA (aal2). Combined with the permissive policy above,
-- BOTH must pass, so data is unreadable until 2FA is verified.
drop policy if exists "bills_require_mfa" on public.bills;
create policy "bills_require_mfa"
  on public.bills
  as restrictive
  for all
  to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2')
  with check ((select auth.jwt() ->> 'aal') = 'aal2');

drop policy if exists "incomes_require_mfa" on public.incomes;
create policy "incomes_require_mfa"
  on public.incomes
  as restrictive
  for all
  to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2')
  with check ((select auth.jwt() ->> 'aal') = 'aal2');
