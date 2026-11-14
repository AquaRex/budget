<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Transactions are the truth

A personal budgeting site (budgets, loans, savings, goals). Everything is measured against the stored transactions in `public.transactions` — they are the source of truth for the whole app. Protect them above everything else.

## Historical data must never be lost

The database is a permanent, long-term record (10–20+ years). Banks and CSV exports only reach back 1–3 years, so the database will always hold more history than any source.

- A row missing from a newer CSV or the bank API is **not** wrong, stale or a duplicate — it is history we keep.
- A duplicate is only a fully identical row, and even then (e.g. two equal transfers on one day) it may be real. Never remove one automatically.
- Never delete, archive, hide or overwrite existing transactions unless the user explicitly asks for that specific change.
- Discrepancy checks are read-only information.
- The website never bulk-deletes transactions (no "clear all", no "delete import"). Wiping data, if ever needed, is done by the user directly in the database. Settings → General offers a full read-only backup download instead.

## Importing transactions (CSV and bank)

New data may only be **added**, and only when it is definitely not already there.

- Imports are insert-only (`ON CONFLICT DO NOTHING`); look-alikes are skipped, never merged.
- Matching is by counting per (own account, booking date, amount) with a few days' tolerance — see `lib/reconcile.ts`. The bank (Sparebanken Norge via Enable Banking) has no unique transaction id.
- Raw source data is kept separately and forever: `bank_raw_transactions` (bank API) and `csv_raw_rows` (CSV).
- Before shipping any import change or new source (e.g. another bank's CSV), verify it against real exports placed in `tempdata/` (git-ignored, never commit).

## Database (Supabase)

Schema changes are numbered SQL files in `supabase/migrations/`, run by the user in the Supabase SQL Editor — additive and safe to re-run. All tables use RLS: owner-only plus a restrictive `aal2` (2FA) policy. Edge Functions live in `supabase/functions/` (`bank`, `quotes`).

## Deploying

Static export to GitHub Pages under `/budget` (`pnpm run deploy`, then commit `docs/` and push). Run any new migration before deploying code that depends on it.

## Skills and references

- `node_modules/next/dist/docs/` — Next.js docs for this version (read before writing code).
- `README.md` — setup and security model.
- `/run` — start the app and check a change in the real UI.
- `/code-review` — review a diff before finishing; `/security-review` for auth, RLS or secrets changes.
