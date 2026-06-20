-- Move the Groups feature to a payment -> category -> group model.
--
-- Groups are no longer a manually-flagged set mapped from bank types. Instead:
--   * Group   = a category that your Bills/Income entries use (auto-derived).
--   * Category = a category in the shared pool (bank types + your own, e.g.
--                "Charging"); each can belong to a group via categories.group_id.
--   * A payment's category resolves as before (explicit override, else the
--     bank type's category); its group is that category's group.
--
-- Run AFTER 0008_groups.sql.

-- 1) A category can belong to a group (another category). Null = unassigned.
alter table public.categories
  add column if not exists group_id uuid references public.categories (id) on delete set null;

create index if not exists categories_group_idx on public.categories (group_id);

-- 2) Carry over existing bank-type -> group assignments: set group_id on the
--    category that each mapped bank type resolves to.
update public.categories c
set group_id = tg.group_id
from public.type_groups tg
join public.type_categories tc
  on tc.user_id = tg.user_id and tc.bank_type = tg.bank_type
where c.id = tc.category_id
  and c.group_id is null
  and c.id <> tg.group_id;

-- 3) Drop the obsolete bank_type -> group table and the manual is_group flag;
--    groups are now derived from which categories Bills/Income use.
drop table if exists public.type_groups;
alter table public.categories drop column if exists is_group;
