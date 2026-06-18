-- Actual spending tracking: imported bank transactions, plus rules that map a
-- merchant description or account number to a (bill) category so future imports
-- categorise automatically.
--
-- Run AFTER 0004_categories_reorder.sql.

-- ---------------------------------------------------------------------------
-- Imports: one row per uploaded CSV (so we can say "as of <upload time>")
-- ---------------------------------------------------------------------------

create table if not exists public.imports (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  label       text,
  filename    text,
  uploaded_at timestamptz not null default now(),
  row_count   integer not null default 0,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Transactions: one row per CSV line, deduped per user via dedup_key
-- amount: negative = money out (spending), positive = money in (income)
-- ---------------------------------------------------------------------------

create table if not exists public.transactions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  import_id    uuid references public.imports (id) on delete set null,
  booked_date  date not null,
  tx_date      date,
  type         text,
  description  text,
  message      text,
  amount       numeric(14, 2) not null,
  currency     text not null default 'NOK',
  from_account text,
  to_account   text,
  category_id  uuid references public.categories (id) on delete set null,
  is_internal  boolean not null default false,
  is_excluded  boolean not null default false,
  -- Exact-content key: identical re-uploaded line is a no-op.
  dedup_key    text not null,
  -- Looser identity key (ignores amount / booking date) so a pending charge
  -- that later settles for a different amount is matched as the *same* tx.
  identity_key text not null default '',
  -- A proposed updated value from a later import, awaiting the user's choice.
  -- When set, the row is shown as a conflict (old red vs new green).
  pending_amount      numeric(14, 2),
  pending_booked_date date,
  created_at   timestamptz not null default now(),
  constraint transactions_dedup_key unique (user_id, dedup_key)
);

create index if not exists transactions_user_date_idx
  on public.transactions (user_id, booked_date);
create index if not exists transactions_user_cat_idx
  on public.transactions (user_id, category_id);
create index if not exists transactions_user_identity_idx
  on public.transactions (user_id, identity_key);

-- ---------------------------------------------------------------------------
-- Rules: remember "this merchant / account => this category"
-- ---------------------------------------------------------------------------

create table if not exists public.tx_rules (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  match_type  text not null check (match_type in ('description', 'account')),
  pattern     text not null check (char_length(pattern) between 1 and 200),
  category_id uuid references public.categories (id) on delete cascade,
  created_at  timestamptz not null default now(),
  constraint tx_rules_unique unique (user_id, match_type, pattern)
);

create index if not exists tx_rules_user_idx on public.tx_rules (user_id);

-- ---------------------------------------------------------------------------
-- RLS: owner-only + restrictive aal2 (same pattern as the other tables)
-- ---------------------------------------------------------------------------

alter table public.imports enable row level security;
alter table public.transactions enable row level security;
alter table public.tx_rules enable row level security;

drop policy if exists "imports_owner" on public.imports;
create policy "imports_owner" on public.imports for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists "imports_require_mfa" on public.imports;
create policy "imports_require_mfa" on public.imports as restrictive for all to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2') with check ((select auth.jwt() ->> 'aal') = 'aal2');

drop policy if exists "transactions_owner" on public.transactions;
create policy "transactions_owner" on public.transactions for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists "transactions_require_mfa" on public.transactions;
create policy "transactions_require_mfa" on public.transactions as restrictive for all to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2') with check ((select auth.jwt() ->> 'aal') = 'aal2');

drop policy if exists "tx_rules_owner" on public.tx_rules;
create policy "tx_rules_owner" on public.tx_rules for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists "tx_rules_require_mfa" on public.tx_rules;
create policy "tx_rules_require_mfa" on public.tx_rules as restrictive for all to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2') with check ((select auth.jwt() ->> 'aal') = 'aal2');
