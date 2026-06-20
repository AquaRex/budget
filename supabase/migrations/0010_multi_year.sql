-- Multi-year budgets: every bill/income entry, per-month amount and salary
-- profile is scoped to a calendar year. Earlier `create table if not exists`
-- migrations may have left entry_amounts / salary_settings without their `year`
-- column, so this adds it everywhere it's needed.
--
-- Run in the Supabase SQL Editor. SAFE TO RUN MULTIPLE TIMES.

-- entries.year ---------------------------------------------------------------
alter table public.entries add column if not exists year integer;
update public.entries set year = extract(year from now())::int where year is null;
alter table public.entries alter column year set not null;
alter table public.entries alter column year set default extract(year from now())::int;
create index if not exists entries_year_idx on public.entries (year);

-- entry_amounts.year (per-month overrides keyed by entry + year + month) ------
alter table public.entry_amounts add column if not exists year integer;
update public.entry_amounts set year = extract(year from now())::int where year is null;
alter table public.entry_amounts alter column year set not null;
create unique index if not exists entry_amounts_entry_year_month_uidx
  on public.entry_amounts (entry_id, year, month);

-- salary_settings.year (one profile per user per year) -----------------------
alter table public.salary_settings add column if not exists year integer;
update public.salary_settings set year = extract(year from now())::int where year is null;
alter table public.salary_settings alter column year set not null;
-- Replace any single-column (user_id) primary key with a (user_id, year) one.
alter table public.salary_settings drop constraint if exists salary_settings_pkey;
create unique index if not exists salary_settings_user_year_uidx
  on public.salary_settings (user_id, year);

-- Reload the REST API schema cache so the new columns are visible immediately.
notify pgrst, 'reload schema';
