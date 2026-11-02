-- Savings: optional expected yearly return per holding (e.g. 10 = 10 %/yr).
-- Goals grow the holding's current value at this rate; null = no growth assumed.
--
-- Run AFTER 0020_goals.sql, in the Supabase SQL Editor. Safe to re-run.

alter table public.holdings
  add column if not exists expected_return_pct numeric
    check (expected_return_pct > -100 and expected_return_pct <= 100);

notify pgrst, 'reload schema';
