-- Your own names for bank accounts (the bank only sends a product code like
-- "LOCDEPOSIT"), and your payment cards for the dashboard.
--
-- Cards hold display details only: name, network, LAST 4 digits, expiry and the
-- account the card draws from. Never a full card number or CVC — the table
-- only accepts exactly 4 digits.
--
-- Also: tags you put on a purchase while it's still pending at the bank. The
-- pending row isn't stored as a transaction, so the tag waits here and is put on
-- the booked row when that is added (matched by account, merchant text, amount
-- and date). A note that is used gets used_at set; nothing in transactions is
-- changed by this table.
--
-- Run AFTER 0028_bank_import.sql, in the Supabase SQL Editor. Safe to re-run.
-- Adds new tables only; changes nothing existing.

create table if not exists public.account_names (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  account_number text not null check (account_number ~ '^\d{11}$'),
  name           text not null check (char_length(name) between 1 and 60),
  created_at     timestamptz not null default now(),
  constraint account_names_unique unique (user_id, account_number)
);

create table if not exists public.payment_cards (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name           text not null check (char_length(name) between 1 and 60),
  network        text check (network in ('visa', 'mastercard', 'amex', 'other')),
  last4          text check (last4 ~ '^\d{4}$'),
  expiry         text check (expiry ~ '^(0[1-9]|1[0-2])/\d{2}$'),
  account_number text check (account_number ~ '^\d{11}$'),
  sort_order     int not null default 0,
  created_at     timestamptz not null default now()
);

create table if not exists public.pending_labels (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  pending_key    text not null,          -- the pending row's id in the list
  account_number text not null,
  booked_date    date not null,          -- the pending row's date
  amount         numeric(14, 2) not null,
  description    text,
  label_id       uuid not null references public.labels (id) on delete cascade,
  used_at        timestamptz,            -- set when given to the booked row
  created_at     timestamptz not null default now(),
  constraint pending_labels_unique unique (user_id, pending_key)
);

do $$
declare t text;
begin
  foreach t in array array['account_names', 'payment_cards', 'pending_labels'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_owner', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))',
      t || '_owner', t);
    execute format('drop policy if exists %I on public.%I', t || '_require_mfa', t);
    execute format(
      'create policy %I on public.%I as restrictive for all to authenticated using ((select auth.jwt() ->> ''aal'') = ''aal2'') with check ((select auth.jwt() ->> ''aal'') = ''aal2'')',
      t || '_require_mfa', t);
  end loop;
end $$;

notify pgrst, 'reload schema';
