-- Multi-user is already the design (every table is scoped by user_id + RLS).
-- This migration only relaxes the *2FA* requirement for one specific account —
-- the demo user — so it can be shown without a TOTP app. Every other account
-- (you, any real friend) still requires password + verified 2FA (aal2) to read
-- or write anything; the demo's rows are fake.
--
-- It rewrites every existing "<table>_require_mfa" restrictive policy in place,
-- driven off the live catalog so it can't reference a table that no longer
-- exists. Keep 'demo@demo.com' in sync with NEXT_PUBLIC_DEMO_EMAIL in the app.
--
-- Run AFTER 0013_label_category.sql, in the Supabase SQL Editor.

do $$
declare
  r record;
  -- aal2, OR the demo account (matched by email claim, case-insensitive).
  gate text := '((select auth.jwt() ->> ''aal'') = ''aal2'' '
            || 'or lower((select auth.jwt() ->> ''email'')) = ''demo@demo.com'')';
begin
  for r in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public' and policyname ~ '_require_mfa$'
  loop
    execute format('drop policy if exists %I on %I.%I',
                   r.policyname, r.schemaname, r.tablename);
    execute format(
      'create policy %I on %I.%I as restrictive for all to authenticated '
      || 'using (%s) with check (%s)',
      r.policyname, r.schemaname, r.tablename, gate, gate
    );
  end loop;
end $$;

notify pgrst, 'reload schema';
