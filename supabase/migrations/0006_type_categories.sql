-- Group the bank's own transaction "Type" (e.g. "Spill", "Programvare",
-- "Dagligvarer") into your budget categories. A type with no mapping stays
-- ungrouped and shows up as its own bucket in the spending breakdown.
--
-- Run AFTER 0005_transactions.sql.

create table if not exists public.type_categories (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  bank_type   text not null check (char_length(bank_type) between 1 and 120),
  category_id uuid not null references public.categories (id) on delete cascade,
  created_at  timestamptz not null default now(),
  constraint type_categories_unique unique (user_id, bank_type)
);

create index if not exists type_categories_user_idx on public.type_categories (user_id);

alter table public.type_categories enable row level security;

drop policy if exists "type_categories_owner" on public.type_categories;
create policy "type_categories_owner" on public.type_categories for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists "type_categories_require_mfa" on public.type_categories;
create policy "type_categories_require_mfa" on public.type_categories as restrictive for all to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2') with check ((select auth.jwt() ->> 'aal') = 'aal2');
