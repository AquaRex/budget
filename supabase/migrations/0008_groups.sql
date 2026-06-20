-- A higher-level "group" layer on top of the bank's transaction Types. After
-- 0007 promoted every bank Type to its own category, the category pool is too
-- fine-grained to see where you overspend. Groups roll several bank types up
-- into one budget bucket (e.g. "Programvare" + "Internettjenester" ->
-- "Entertainment") for the Groups page, WITHOUT touching the detailed bank-type
-- view that the Spending page draws from type_categories.
--
-- Run AFTER 0007_shared_categories.sql.

-- 1) Flag which categories act as high-level groups (the manually chosen set
--    shown as bands on the Groups page).
alter table public.categories
  add column if not exists is_group boolean not null default false;

-- 2) Map each bank "Type" to a group category. Separate from type_categories so
--    both the grouped and the detailed views can coexist.
create table if not exists public.type_groups (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  bank_type  text not null check (char_length(bank_type) between 1 and 120),
  group_id   uuid not null references public.categories (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint type_groups_unique unique (user_id, bank_type)
);

create index if not exists type_groups_user_idx on public.type_groups (user_id);

alter table public.type_groups enable row level security;

drop policy if exists "type_groups_owner" on public.type_groups;
create policy "type_groups_owner" on public.type_groups for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists "type_groups_require_mfa" on public.type_groups;
create policy "type_groups_require_mfa" on public.type_groups as restrictive for all to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2') with check ((select auth.jwt() ->> 'aal') = 'aal2');
