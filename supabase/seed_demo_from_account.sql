-- Copy your real account's BUDGET + taxonomy onto the demo user, with fresh
-- primary keys and remapped foreign keys. Transactions and imports are
-- intentionally NOT copied — you'll import a fake CSV into the demo later.
--
-- Source = the (non-demo) account that owns the most budget entries; that's you.
-- Destination = demo@demo.com. Safe to re-run: it clears the demo's copied rows
-- first, then re-copies. Run in the Supabase SQL Editor (it runs as owner and
-- bypasses RLS, so it can read your rows and write the demo's).

drop table if exists _copy_ids;
create temp table _copy_ids as
select
  (select id from auth.users where lower(email) = 'demo@demo.com') as dst,
  (
    select e.user_id
    from public.entries e
    where e.user_id <> (select id from auth.users where lower(email) = 'demo@demo.com')
    group by e.user_id
    order by count(*) desc
    limit 1
  ) as src;

do $$
begin
  if (select src from _copy_ids) is null then
    raise exception 'No source account with budget entries was found.';
  end if;
  if (select dst from _copy_ids) is null then
    raise exception 'Demo user demo@demo.com not found — create it first.';
  end if;
end $$;

-- 1) Clear the demo's existing copied rows (children first); keep its transactions.
delete from public.entry_amounts   where user_id = (select dst from _copy_ids);
delete from public.entries         where user_id = (select dst from _copy_ids);
delete from public.salary_settings where user_id = (select dst from _copy_ids);
delete from public.labels          where user_id = (select dst from _copy_ids);
delete from public.type_categories where user_id = (select dst from _copy_ids);
delete from public.tx_rules        where user_id = (select dst from _copy_ids);
do $$ begin
  if to_regclass('public.type_groups') is not null then
    delete from public.type_groups where user_id = (select dst from _copy_ids);
  end if;
end $$;
delete from public.payment_methods where user_id = (select dst from _copy_ids);
delete from public.categories      where user_id = (select dst from _copy_ids);

-- 2) Categories (new ids; remap the self-referencing group_id).
drop table if exists _cat_map;
create temp table _cat_map as
select id as old_id, gen_random_uuid() as new_id
from public.categories where user_id = (select src from _copy_ids);

insert into public.categories (id, user_id, name, sort_order, group_id, created_at)
select m.new_id, (select dst from _copy_ids), c.name, c.sort_order, gm.new_id, now()
from public.categories c
join _cat_map m  on m.old_id = c.id
left join _cat_map gm on gm.old_id = c.group_id
where c.user_id = (select src from _copy_ids);

-- 3) Payment methods (new ids).
drop table if exists _pm_map;
create temp table _pm_map as
select id as old_id, gen_random_uuid() as new_id
from public.payment_methods where user_id = (select src from _copy_ids);

insert into public.payment_methods (id, user_id, name, sort_order, created_at)
select m.new_id, (select dst from _copy_ids), p.name, p.sort_order, now()
from public.payment_methods p
join _pm_map m on m.old_id = p.id
where p.user_id = (select src from _copy_ids);

-- 4) Entries / bills & income (new ids; remap category_id + method_id).
drop table if exists _entry_map;
create temp table _entry_map as
select id as old_id, gen_random_uuid() as new_id
from public.entries where user_id = (select src from _copy_ids);

insert into public.entries
  (id, user_id, kind, year, name, category_id, method_id, due_day,
   is_recurring, default_amount, is_active, is_salary, sort_order, created_at)
select em.new_id, (select dst from _copy_ids), e.kind, e.year, e.name,
       cm.new_id, pm.new_id, e.due_day, e.is_recurring, e.default_amount,
       e.is_active, e.is_salary, e.sort_order, now()
from public.entries e
join _entry_map em on em.old_id = e.id
left join _cat_map cm on cm.old_id = e.category_id
left join _pm_map  pm on pm.old_id = e.method_id
where e.user_id = (select src from _copy_ids);

-- 5) Monthly amounts (remap entry_id).
insert into public.entry_amounts (user_id, entry_id, year, month, amount)
select (select dst from _copy_ids), em.new_id, a.year, a.month, a.amount
from public.entry_amounts a
join _entry_map em on em.old_id = a.entry_id
where a.user_id = (select src from _copy_ids);

-- 6) Salary settings (keyed by user_id + year).
insert into public.salary_settings
  (user_id, year, yearly_salary, tax_pct, half_tax_pct, vacation_rate_pct,
   feriepenger_month, half_tax_month, workdays_per_month, vacation_days,
   deduction_days, updated_at)
select (select dst from _copy_ids), s.year, s.yearly_salary, s.tax_pct,
       s.half_tax_pct, s.vacation_rate_pct, s.feriepenger_month, s.half_tax_month,
       s.workdays_per_month, s.vacation_days, s.deduction_days, now()
from public.salary_settings s
where s.user_id = (select src from _copy_ids);

-- 7) Labels (remap home category_id).
insert into public.labels (id, user_id, name, category_id, created_at)
select gen_random_uuid(), (select dst from _copy_ids), l.name, cm.new_id, now()
from public.labels l
left join _cat_map cm on cm.old_id = l.category_id
where l.user_id = (select src from _copy_ids);

-- 8) Bank type -> category map (remap category_id).
insert into public.type_categories (id, user_id, bank_type, category_id, created_at)
select gen_random_uuid(), (select dst from _copy_ids), tc.bank_type, cm.new_id, now()
from public.type_categories tc
join _cat_map cm on cm.old_id = tc.category_id
where tc.user_id = (select src from _copy_ids);

-- 9) Merchant rules (remap category_id).
insert into public.tx_rules (id, user_id, match_type, pattern, category_id, created_at)
select gen_random_uuid(), (select dst from _copy_ids), r.match_type, r.pattern, cm.new_id, now()
from public.tx_rules r
left join _cat_map cm on cm.old_id = r.category_id
where r.user_id = (select src from _copy_ids);

-- 10) Bank type -> group map (remap group_id) — only if the table exists.
do $$ begin
  if to_regclass('public.type_groups') is not null then
    insert into public.type_groups (id, user_id, bank_type, group_id, created_at)
    select gen_random_uuid(), (select dst from _copy_ids), tg.bank_type, cm.new_id, now()
    from public.type_groups tg
    join _cat_map cm on cm.old_id = tg.group_id
    where tg.user_id = (select src from _copy_ids);
  end if;
end $$;
