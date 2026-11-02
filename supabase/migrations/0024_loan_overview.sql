-- Loans: whether a loan counts in the "All debt" overview (on by default).
-- Off = it keeps its own card but is left out of the totals and the graph.
--
-- Run AFTER 0023_loan_history.sql, in the Supabase SQL Editor. Safe to re-run.

alter table public.loans
  add column if not exists in_overview boolean not null default true;

notify pgrst, 'reload schema';
