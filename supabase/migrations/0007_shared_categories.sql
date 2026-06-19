-- One shared category list (no bill/income split) and every bank transaction
-- "Type" promoted to a category. The bank CSV is the source of truth; bills and
-- income are the budget, and they now draw from the same category pool — so a
-- "Lønn" type and a budgeted "Salary" line can line up, etc.
--
-- Run AFTER 0006_type_categories.sql.

-- 1) Merge categories that share a name (case-insensitive) within a user,
--    repointing everything that referenced the duplicates.
create temporary table cat_merge as
select c.id as old_id, k.keep_id
from public.categories c
join (
  select user_id, lower(name) as lname,
         (array_agg(id order by created_at, id))[1] as keep_id
  from public.categories
  group by user_id, lower(name)
) k on k.user_id = c.user_id and lower(c.name) = k.lname
where c.id <> k.keep_id;

update public.entries e set category_id = m.keep_id
  from cat_merge m where e.category_id = m.old_id;
update public.transactions t set category_id = m.keep_id
  from cat_merge m where t.category_id = m.old_id;
update public.tx_rules r set category_id = m.keep_id
  from cat_merge m where r.category_id = m.old_id;
update public.type_categories tc set category_id = m.keep_id
  from cat_merge m where tc.category_id = m.old_id;
delete from public.categories c using cat_merge m where c.id = m.old_id;
drop table cat_merge;

-- 2) Drop the kind dimension; categories are shared from now on.
drop index if exists public.categories_user_kind_idx;
alter table public.categories drop column if exists kind;
create index if not exists categories_user_idx on public.categories (user_id);
create unique index if not exists categories_user_name_uniq
  on public.categories (user_id, lower(name));

-- 3) Promote every bank "Type" (excluding internal transfers) to a category,
--    and map the type to that same-named category when not already mapped.
insert into public.categories (user_id, name, sort_order)
select d.user_id, d.type,
       coalesce((select max(sort_order) from public.categories c2
                 where c2.user_id = d.user_id), -1)
       + row_number() over (partition by d.user_id order by d.type)
from (
  select distinct user_id, btrim(type) as type
  from public.transactions
  where type is not null and btrim(type) <> ''
    and lower(type) not like '%overf%'
    and lower(type) <> 'nettbank'
) d
where not exists (
  select 1 from public.categories c
  where c.user_id = d.user_id and lower(c.name) = lower(d.type)
);

insert into public.type_categories (user_id, bank_type, category_id)
select d.user_id, d.type, c.id
from (
  select distinct user_id, btrim(type) as type
  from public.transactions
  where type is not null and btrim(type) <> ''
    and lower(type) not like '%overf%'
    and lower(type) <> 'nettbank'
) d
join public.categories c
  on c.user_id = d.user_id and lower(c.name) = lower(d.type)
where not exists (
  select 1 from public.type_categories tc
  where tc.user_id = d.user_id and tc.bank_type = d.type
);
