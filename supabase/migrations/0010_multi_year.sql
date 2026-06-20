-- Multi-year budgets: scope each bill/income entry to a calendar year so every
-- year has its own set of entries (and per-month amounts). entry_amounts and
-- salary_settings already carry a `year`; entries did not.
--
-- Run in the Supabase SQL Editor AFTER 0009_category_groups.sql.
--
-- Existing entries are stamped with the current year (the default below is
-- evaluated once when the column is added, backfilling every existing row).

alter table public.entries
  add column if not exists year integer not null
    default extract(year from now())::int
    check (year between 2000 and 2100);

create index if not exists entries_year_idx on public.entries (year);
