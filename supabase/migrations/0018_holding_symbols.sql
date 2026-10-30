-- Savings: link a holding to a market ticker (Yahoo Finance symbol, e.g.
-- "EQNR.OL" or a fund's "0P00018V9L.IR") so its value follows the market.
-- Holdings without a symbol keep working with prices entered by hand.
--
-- Run AFTER 0017_savings.sql, in the Supabase SQL Editor. Safe to re-run.

alter table public.holdings
  add column if not exists symbol text;

notify pgrst, 'reload schema';
