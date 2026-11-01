-- Savings goals: an amount to reach by the end of a month (December by
-- default). The Goals page projects when you'll get there from the budget and
-- from how your actual months compare with it.
--
--   start_amount      what you already have towards it outside the Savings tab
--                     (e.g. a savings account)
--   include_holdings  also count today's value of the Savings tab holdings
--
-- Run AFTER 0019_trade_dates.sql, in the Supabase SQL Editor. Safe to re-run.

create table if not exists public.goals (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name             text not null check (char_length(name) between 1 and 80),
  target_amount    numeric not null check (target_amount > 0),
  target_year      int not null check (target_year between 2000 and 2100),
  target_month     int not null default 12 check (target_month between 1 and 12),
  start_amount     numeric not null default 0 check (start_amount >= 0),
  include_holdings boolean not null default true,
  sort_order       int not null default 0,
  created_at       timestamptz not null default now()
);

create index if not exists goals_user_idx on public.goals (user_id);

-- Same access rules as every other table: owner only, and 2FA (aal2) unless
-- it's the demo account (see 0014).
alter table public.goals enable row level security;

drop policy if exists goals_owner on public.goals;
create policy goals_owner on public.goals for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists goals_require_mfa on public.goals;
create policy goals_require_mfa on public.goals as restrictive for all to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2' or lower((select auth.jwt() ->> 'email')) = 'demo@demo.com')
  with check ((select auth.jwt() ->> 'aal') = 'aal2' or lower((select auth.jwt() ->> 'email')) = 'demo@demo.com');

notify pgrst, 'reload schema';
