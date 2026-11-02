-- Loans: work the balance backwards through payments made before the start
-- month (on by default). Off = the loan's history starts at the start month.
--
-- Run AFTER 0022_loans.sql, in the Supabase SQL Editor. Safe to re-run.

alter table public.loans
  add column if not exists include_history boolean not null default true;

notify pgrst, 'reload schema';
