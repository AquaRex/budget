-- Full card details (card number, CVC, PIN), stored ENCRYPTED in Supabase Vault.
--
--   * The secrets never sit in a normal table: payment_cards only keeps the id
--     of the Vault secret. Vault encrypts it at rest (backups/dumps stay safe).
--   * Only these functions can read or write them, and only for your own card
--     while signed in with 2FA (aal2). The site fetches them only when you
--     click the eye icon.
--   * Removing a card also removes its Vault secret.
--
-- Run AFTER 0029_account_names_cards.sql, in the Supabase SQL Editor. Safe to
-- re-run. Adds only; changes no existing data.

create extension if not exists supabase_vault with schema vault;

alter table public.payment_cards
  add column if not exists secret_id uuid;

-- Save (or update) a card's secret details. Empty/NULL arguments keep the
-- existing value, so you can change just one of them.
create or replace function public.set_card_secret(
  p_card_id uuid,
  p_number  text,
  p_cvc     text,
  p_pin     text
)
returns void
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_secret_id uuid;
  v_old jsonb := '{}'::jsonb;
  v_new jsonb;
  v_number text := nullif(regexp_replace(coalesce(p_number, ''), '\D', '', 'g'), '');
  v_cvc    text := nullif(regexp_replace(coalesce(p_cvc, ''), '\D', '', 'g'), '');
  v_pin    text := nullif(regexp_replace(coalesce(p_pin, ''), '\D', '', 'g'), '');
begin
  if auth.uid() is null or coalesce(auth.jwt() ->> 'aal', '') <> 'aal2' then
    raise exception 'Two-factor sign-in required';
  end if;
  if v_number is not null and v_number !~ '^\d{12,19}$' then
    raise exception 'Card number must be 12–19 digits';
  end if;
  if v_cvc is not null and v_cvc !~ '^\d{3,4}$' then
    raise exception 'CVC must be 3–4 digits';
  end if;
  if v_pin is not null and v_pin !~ '^\d{4,6}$' then
    raise exception 'PIN must be 4–6 digits';
  end if;

  select secret_id into v_secret_id
  from public.payment_cards
  where id = p_card_id and user_id = auth.uid();
  if not found then
    raise exception 'Card not found';
  end if;

  if v_secret_id is not null then
    select coalesce(decrypted_secret::jsonb, '{}'::jsonb) into v_old
    from vault.decrypted_secrets where id = v_secret_id;
  end if;

  v_new := v_old
    || case when v_number is not null then jsonb_build_object('number', v_number) else '{}'::jsonb end
    || case when v_cvc    is not null then jsonb_build_object('cvc', v_cvc)       else '{}'::jsonb end
    || case when v_pin    is not null then jsonb_build_object('pin', v_pin)       else '{}'::jsonb end;

  if v_secret_id is null then
    v_secret_id := vault.create_secret(v_new::text, 'card_' || p_card_id::text, 'Payment card details');
    update public.payment_cards set secret_id = v_secret_id where id = p_card_id;
  else
    perform vault.update_secret(v_secret_id, v_new::text);
  end if;

  -- Keep the visible last 4 digits in step with the full number.
  if v_number is not null then
    update public.payment_cards set last4 = right(v_number, 4) where id = p_card_id;
  end if;
end $$;

-- Read a card's secret details (number, cvc, pin) — own card, 2FA only.
create or replace function public.get_card_secret(p_card_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_secret_id uuid;
  v_out jsonb;
begin
  if auth.uid() is null or coalesce(auth.jwt() ->> 'aal', '') <> 'aal2' then
    raise exception 'Two-factor sign-in required';
  end if;
  select secret_id into v_secret_id
  from public.payment_cards
  where id = p_card_id and user_id = auth.uid();
  if v_secret_id is null then
    return '{}'::jsonb;
  end if;
  select decrypted_secret::jsonb into v_out
  from vault.decrypted_secrets where id = v_secret_id;
  return coalesce(v_out, '{}'::jsonb);
end $$;

-- Removing a card removes its secret too.
create or replace function public.payment_cards_drop_secret()
returns trigger
language plpgsql
security definer
set search_path = public, vault
as $$
begin
  if old.secret_id is not null then
    delete from vault.secrets where id = old.secret_id;
  end if;
  return old;
end $$;

drop trigger if exists payment_cards_drop_secret on public.payment_cards;
create trigger payment_cards_drop_secret
  after delete on public.payment_cards
  for each row execute function public.payment_cards_drop_secret();

revoke all on function public.set_card_secret(uuid, text, text, text) from public, anon;
revoke all on function public.get_card_secret(uuid) from public, anon;
revoke all on function public.payment_cards_drop_secret() from public, anon, authenticated;
grant execute on function public.set_card_secret(uuid, text, text, text) to authenticated;
grant execute on function public.get_card_secret(uuid) to authenticated;

notify pgrst, 'reload schema';
