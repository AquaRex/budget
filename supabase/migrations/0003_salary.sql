-- Salary calculator: a per-year salary profile that auto-computes the monthly
-- net income for a designated "Salary" income entry (10 normal months, one
-- half-tax month, and the feriepenger/vacation month), matching the Norwegian
-- model. Manual per-month overrides in entry_amounts always win.
--
-- Run AFTER 0002_monthly_amounts.sql.

-- Flag the single income entry that the salary calculator drives.
alter table public.entries
  add column if not exists is_salary boolean not null default false;

-- One salary profile per user per year, so raises between years are supported.
create table if not exists public.salary_settings (
  user_id            uuid not null default auth.uid() references auth.users (id) on delete cascade,
  year               integer not null check (year between 2000 and 2100),
  yearly_salary      numeric(12, 2) not null default 0 check (yearly_salary >= 0),
  tax_pct            numeric(6, 3) not null default 29,
  half_tax_pct       numeric(6, 3) not null default 14.5,
  vacation_rate_pct  numeric(6, 3) not null default 12,
  -- Which month gets feriepenger (replaces salary) and which gets half tax.
  feriepenger_month  integer not null default 6 check (feriepenger_month between 1 and 12),
  half_tax_month     integer not null default 11 check (half_tax_month between 1 and 12),
  -- Advanced day-count constants (Norwegian 5-week defaults: 26 / 25 / 4).
  workdays_per_month numeric(6, 3) not null default 26,
  vacation_days      numeric(6, 3) not null default 25,
  deduction_days     numeric(6, 3) not null default 4,
  updated_at         timestamptz not null default now(),
  primary key (user_id, year)
);

alter table public.salary_settings enable row level security;

drop policy if exists "salary_settings_owner" on public.salary_settings;
create policy "salary_settings_owner"
  on public.salary_settings for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "salary_settings_require_mfa" on public.salary_settings;
create policy "salary_settings_require_mfa"
  on public.salary_settings as restrictive for all to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2')
  with check ((select auth.jwt() ->> 'aal') = 'aal2');
