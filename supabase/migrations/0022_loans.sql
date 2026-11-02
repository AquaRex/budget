-- Loans, and categories that count towards Goals.
--
--   loans                    what you owe at the start of a month, the yearly
--                            interest, and the category (or group) its payments
--                            are placed in. Money out in that category from the
--                            start month on is a payment: interest first, the
--                            rest pays the loan down.
--     monthly_payment        optional: the payment projected forward; null =
--                            the average of the latest payments
--   categories.counts_to_goals
--                            money out here stays normal spending (and in its
--                            group's budget), but Goals count it as progress
--
-- Run AFTER 0021_expected_return.sql, in the Supabase SQL Editor. Safe to re-run.

alter table public.categories
  add column if not exists counts_to_goals boolean not null default false;

create table if not exists public.loans (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name            text not null check (char_length(name) between 1 and 80),
  category_id     uuid references public.categories (id) on delete set null,
  balance         numeric not null check (balance > 0),
  interest_pct    numeric not null default 0 check (interest_pct >= 0 and interest_pct < 100),
  start_year      int not null check (start_year between 2000 and 2100),
  start_month     int not null check (start_month between 1 and 12),
  monthly_payment numeric check (monthly_payment > 0),
  sort_order      int not null default 0,
  created_at      timestamptz not null default now()
);

create index if not exists loans_user_idx on public.loans (user_id);

-- Same access rules as every other table: owner only, and 2FA (aal2) unless
-- it's the demo account (see 0014).
alter table public.loans enable row level security;

drop policy if exists loans_owner on public.loans;
create policy loans_owner on public.loans for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists loans_require_mfa on public.loans;
create policy loans_require_mfa on public.loans as restrictive for all to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2' or lower((select auth.jwt() ->> 'email')) = 'demo@demo.com')
  with check ((select auth.jwt() ->> 'aal') = 'aal2' or lower((select auth.jwt() ->> 'email')) = 'demo@demo.com');

notify pgrst, 'reload schema';
