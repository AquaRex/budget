-- Categories as reorderable groups, a managed payment-method list, entry
-- ordering, and removal of the year dimension (entries are a single recurring
-- Jan-Dec template that repeats every year).
--
-- Run AFTER 0003_salary.sql.

-- ---------------------------------------------------------------------------
-- Categories (per kind) and payment methods (shared)
-- ---------------------------------------------------------------------------

create table if not exists public.categories (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind       text not null check (kind in ('bill', 'income')),
  name       text not null check (char_length(name) between 1 and 80),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.payment_methods (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 60),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists categories_user_kind_idx on public.categories (user_id, kind);
create index if not exists payment_methods_user_idx on public.payment_methods (user_id);

alter table public.categories enable row level security;
alter table public.payment_methods enable row level security;

drop policy if exists "categories_owner" on public.categories;
create policy "categories_owner" on public.categories for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists "categories_require_mfa" on public.categories;
create policy "categories_require_mfa" on public.categories as restrictive for all to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2') with check ((select auth.jwt() ->> 'aal') = 'aal2');

drop policy if exists "payment_methods_owner" on public.payment_methods;
create policy "payment_methods_owner" on public.payment_methods for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists "payment_methods_require_mfa" on public.payment_methods;
create policy "payment_methods_require_mfa" on public.payment_methods as restrictive for all to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2') with check ((select auth.jwt() ->> 'aal') = 'aal2');

-- ---------------------------------------------------------------------------
-- Entries: link to category + method, add ordering
-- ---------------------------------------------------------------------------

alter table public.entries
  add column if not exists category_id uuid references public.categories (id) on delete set null,
  add column if not exists method_id   uuid references public.payment_methods (id) on delete set null,
  add column if not exists sort_order   integer not null default 0;

-- Convert existing free-text categories into category rows, then link entries.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'entries' and column_name = 'category'
  ) then
    insert into public.categories (user_id, kind, name, sort_order)
    select user_id, kind, category,
           row_number() over (partition by user_id, kind order by category) - 1
    from (
      select distinct user_id, kind, category
      from public.entries
      where category is not null and category <> ''
    ) d;

    update public.entries e
    set category_id = c.id
    from public.categories c
    where e.category is not null
      and c.user_id = e.user_id
      and c.kind = e.kind
      and c.name = e.category;

    alter table public.entries drop column category;
  end if;
end $$;

-- Initial entry ordering: by category then creation time.
update public.entries e
set sort_order = s.rn
from (
  select id,
         row_number() over (
           partition by user_id, kind, coalesce(category_id::text, '~')
           order by created_at
         ) - 1 as rn
  from public.entries
) s
where e.id = s.id;

-- ---------------------------------------------------------------------------
-- Drop the year dimension from entry_amounts (collapse to one Jan-Dec template)
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'entry_amounts' and column_name = 'year'
  ) then
    -- Keep the most recent year's value where duplicates exist per month.
    delete from public.entry_amounts a
    using public.entry_amounts b
    where a.entry_id = b.entry_id and a.month = b.month and a.year < b.year;

    alter table public.entry_amounts drop column year;
    alter table public.entry_amounts
      add constraint entry_amounts_entry_month_key unique (entry_id, month);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Salary settings: one profile per user (drop year)
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'salary_settings' and column_name = 'year'
  ) then
    delete from public.salary_settings a
    using public.salary_settings b
    where a.user_id = b.user_id and a.year < b.year;

    alter table public.salary_settings drop constraint salary_settings_pkey;
    alter table public.salary_settings drop column year;
    alter table public.salary_settings add primary key (user_id);
  end if;
end $$;
