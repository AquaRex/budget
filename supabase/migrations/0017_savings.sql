-- Savings: funds, stocks and employee share plans, tracked month by month.
--
--   holdings        one fund / stock / share plan. A plan buys at discount_pct
--                   below market and pays bonus_ratio bonus shares per share
--                   still held bonus_years after purchase (sales are FIFO).
--   holding_trades  what was bought or sold in a month (one buy + one sell per
--                   holding per month); amount = NOK paid or received.
--   holding_prices  price per unit entered for a month (valuation).
--
-- Run AFTER 0016_explicit_groups.sql, in the Supabase SQL Editor. Safe to re-run.

create table if not exists public.holdings (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name         text not null check (char_length(name) between 1 and 80),
  kind         text not null default 'fund' check (kind in ('fund', 'stock', 'plan')),
  discount_pct numeric not null default 0 check (discount_pct >= 0 and discount_pct < 100),
  bonus_years  int not null default 3 check (bonus_years between 1 and 10),
  bonus_ratio  numeric not null default 1 check (bonus_ratio >= 0),
  sort_order   int not null default 0,
  created_at   timestamptz not null default now()
);

create table if not exists public.holding_trades (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  holding_id uuid not null references public.holdings (id) on delete cascade,
  year       int not null,
  month      int not null check (month between 1 and 12),
  side       text not null check (side in ('buy', 'sell')),
  units      numeric not null check (units > 0),
  amount     numeric not null check (amount >= 0),
  unique (holding_id, year, month, side)
);

create table if not exists public.holding_prices (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  holding_id uuid not null references public.holdings (id) on delete cascade,
  year       int not null,
  month      int not null check (month between 1 and 12),
  price      numeric not null check (price >= 0),
  unique (holding_id, year, month)
);

create index if not exists holdings_user_idx on public.holdings (user_id);
create index if not exists holding_trades_user_idx on public.holding_trades (user_id);
create index if not exists holding_prices_user_idx on public.holding_prices (user_id);

-- Same access rules as every other table: owner only, and 2FA (aal2) unless
-- it's the demo account (see 0014).
do $$
declare
  t text;
  gate text := '((select auth.jwt() ->> ''aal'') = ''aal2'' '
            || 'or lower((select auth.jwt() ->> ''email'')) = ''demo@demo.com'')';
begin
  foreach t in array array['holdings', 'holding_trades', 'holding_prices'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_owner', t);
    execute format(
      'create policy %I on public.%I for all to authenticated '
      || 'using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))',
      t || '_owner', t
    );
    execute format('drop policy if exists %I on public.%I', t || '_require_mfa', t);
    execute format(
      'create policy %I on public.%I as restrictive for all to authenticated '
      || 'using (%s) with check (%s)',
      t || '_require_mfa', t, gate, gate
    );
  end loop;
end $$;

notify pgrst, 'reload schema';
