-- Savings/investment groups. A category flagged is_savings is a group whose
-- money is set aside, not spent: outflows placed there count as "saved"
-- (withdrawals subtract), and its budgeted bills are a savings budget.
--
-- Run AFTER 0014_demo_user.sql, in the Supabase SQL Editor.

alter table public.categories
  add column if not exists is_savings boolean not null default false;

notify pgrst, 'reload schema';
