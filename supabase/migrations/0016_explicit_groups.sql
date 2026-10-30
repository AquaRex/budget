-- Category model overhaul: explicit groups, tags as plain markers.
--
-- BEFORE RUNNING: take a backup (Supabase dashboard -> Database -> Backups, or
-- `pg_dump`). Step 2 rewrites transaction categories and drops a column.
--
-- Run AFTER 0015_savings_groups.sql, in the Supabase SQL Editor. Safe to re-run.

-- 1) Groups become an explicit flag instead of "whatever a Bills/Income entry
--    uses". Backfill: every category any entry uses (any year) is a group, so
--    every existing entry keeps pointing at a group. Every other category is
--    meant to belong to a group via group_id (not enforced here; ungrouped ones
--    show as "Needs sorting" in the app).
alter table public.categories
  add column if not exists is_group boolean not null default false;

update public.categories c
set is_group = true
where not c.is_group
  and exists (select 1 from public.entries e where e.category_id = c.id);

-- 2) Tags (labels) become plain markers. A label's "home category" used to
--    re-place its transactions in the group view; bake that into each tagged
--    transaction's own category (only where it differs), then drop the column.
--    Group totals stay the same. Guarded so a re-run is a no-op.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'labels' and column_name = 'category_id'
  ) then
    update public.transactions t
    set category_id = l.category_id
    from public.labels l
    where t.label_id = l.id
      and l.category_id is not null
      and t.category_id is distinct from l.category_id;

    alter table public.labels drop column category_id;
  end if;
end $$;

notify pgrst, 'reload schema';
