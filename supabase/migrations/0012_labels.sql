-- Per-transaction labels: a manual, finer-grained tag *below* the category, so
-- identical-looking merchant rows (e.g. every "STEAMGAMES.COM" charge) can be
-- split by hand into "Path of Exile 2", "Helldivers 2", etc. Labels are never
-- auto-assigned — they're set manually per transaction and reused by name.
--
-- Run AFTER 0011_pending_booked.sql, in the Supabase SQL Editor.

create table if not exists public.labels (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 80),
  created_at timestamptz not null default now()
);

create index if not exists labels_user_idx on public.labels (user_id);
create unique index if not exists labels_user_name_uniq
  on public.labels (user_id, lower(name));

alter table public.labels enable row level security;

drop policy if exists "labels_owner" on public.labels;
create policy "labels_owner" on public.labels for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists "labels_require_mfa" on public.labels;
create policy "labels_require_mfa" on public.labels as restrictive for all to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2') with check ((select auth.jwt() ->> 'aal') = 'aal2');

-- The transaction's manual label (kept on settle; cleared if the label is deleted).
alter table public.transactions
  add column if not exists label_id uuid references public.labels (id) on delete set null;

notify pgrst, 'reload schema';
