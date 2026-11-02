-- Holdings paid from a budget category: every payment out in it (or in any
-- category of it, when it's a group) is a buy in this holding on the day it
-- was paid. Several holdings can share a category, each taking its share of
-- every payment (e.g. 50 / 50 between two funds).
--
-- Run AFTER 0024_loan_overview.sql, in the Supabase SQL Editor. Safe to re-run.

alter table public.holdings
  add column if not exists category_id uuid
    references public.categories (id) on delete set null;

alter table public.holdings
  add column if not exists category_share_pct numeric not null default 100;

alter table public.holdings
  drop constraint if exists holdings_category_share_pct_check;
alter table public.holdings
  add constraint holdings_category_share_pct_check
    check (category_share_pct > 0 and category_share_pct <= 100);

notify pgrst, 'reload schema';
