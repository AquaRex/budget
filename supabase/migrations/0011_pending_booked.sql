-- Robust de-duplication of bank imports across the pending -> booked transition.
--
-- When a card purchase settles, the bank changes its booking date, type, and
-- description (and sometimes the amount), which broke the old keys. We now match
-- on the stable purchase timestamp instead, so we need:
--   * tx_at      : the full purchase timestamp (date + time, to the minute)
--   * is_booked  : false while a row is still pending (Rentedato is empty)
--
-- Run in the Supabase SQL Editor. SAFE TO RUN MULTIPLE TIMES.

alter table public.transactions add column if not exists tx_at text;
alter table public.transactions
  add column if not exists is_booked boolean not null default true;

notify pgrst, 'reload schema';
