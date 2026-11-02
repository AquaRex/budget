-- Detailed rules: put a transaction in a category when ALL the conditions set
-- on the rule match — text in the description, message or bank type (contains,
-- ignoring case), the account it came from or went to (exact), and the amount
-- (between min and max, ignoring the sign). They win over merchant rules, so one
-- merchant (e.g. two fund agreements paid to the same bank) can be split.
--
-- Run AFTER 0025_holding_category.sql, in the Supabase SQL Editor. Safe to re-run.

create table if not exists public.tx_match_rules (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  description  text check (char_length(description) between 1 and 200),
  message      text check (char_length(message) between 1 and 200),
  type         text check (char_length(type) between 1 and 120),
  from_account text check (char_length(from_account) between 1 and 60),
  to_account   text check (char_length(to_account) between 1 and 60),
  amount_min   numeric check (amount_min >= 0),
  amount_max   numeric check (amount_max >= 0),
  category_id  uuid not null references public.categories (id) on delete cascade,
  created_at   timestamptz not null default now(),
  constraint tx_match_rules_has_condition check (
    coalesce(description, message, type, from_account, to_account) is not null
    or amount_min is not null or amount_max is not null
  )
);

create index if not exists tx_match_rules_user_idx on public.tx_match_rules (user_id);

alter table public.tx_match_rules enable row level security;

drop policy if exists "tx_match_rules_owner" on public.tx_match_rules;
create policy "tx_match_rules_owner" on public.tx_match_rules for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists "tx_match_rules_require_mfa" on public.tx_match_rules;
create policy "tx_match_rules_require_mfa" on public.tx_match_rules as restrictive for all to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2' or lower((select auth.jwt() ->> 'email')) = 'demo@demo.com')
  with check ((select auth.jwt() ->> 'aal') = 'aal2' or lower((select auth.jwt() ->> 'email')) = 'demo@demo.com');

notify pgrst, 'reload schema';
