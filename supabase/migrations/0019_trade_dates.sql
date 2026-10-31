-- Savings: the day (and optionally time) a purchase was made, so the app can
-- look up the market price at that moment instead of you entering it.
-- year/month stay the trade's month; trade_date falls inside it.
--
-- Run AFTER 0018_holding_symbols.sql, in the Supabase SQL Editor. Safe to re-run.

alter table public.holding_trades
  add column if not exists trade_date date,
  add column if not exists trade_time text check (trade_time ~ '^\d{2}:\d{2}$');

notify pgrst, 'reload schema';
