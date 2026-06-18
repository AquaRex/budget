# Budget

A personal monthly **bills + income** tracker. Enter recurring bills and income,
and the dashboard shows what's left, where the money goes, and the month's
schedule. Built with Next.js (static export), shadcn/ui, Recharts, and Supabase.

Amounts are shown in **NOK (kr)**. The whole app is locked behind a
**password + TOTP 2FA** login.

## How the security works (important)

The site is a **public static build** hosted on GitHub Pages. Anything shipped to
the browser — including the Supabase **anon key** — is readable. That is fine and
by design:

- The anon key is meant to be public. On its own it returns **no data**.
- Access requires a Supabase **Auth** session (your password) **and** a verified
  **TOTP factor** (Google Authenticator), reaching assurance level `aal2`.
- **Row Level Security** has a *restrictive* `aal2` policy, so every query returns
  zero rows until 2FA is passed.

So a stranger opening the site sees only a login box; reading the source reveals
only the public URL + anon key, which expose nothing.

## One-time setup

### 1. Supabase database

In the Supabase dashboard for project `ecqrqrlupxgaulhpuclf`:

1. Open **SQL Editor** and run **all four** migrations in order:
   [`0001_init.sql`](supabase/migrations/0001_init.sql),
   [`0002_monthly_amounts.sql`](supabase/migrations/0002_monthly_amounts.sql),
   [`0003_salary.sql`](supabase/migrations/0003_salary.sql),
   then [`0004_categories_reorder.sql`](supabase/migrations/0004_categories_reorder.sql).
   These create the `entries`, `entry_amounts`, `salary_settings`, `categories`
   and `payment_methods` tables with all RLS policies. (0002 migrates/removes the
   old `bills`/`incomes` tables; 0004 adds categories/methods/ordering and drops
   the year dimension — the budget is a single recurring Jan–Dec template.)
2. **Authentication → Sign In / Providers**: turn **off** "Allow new users to sign up"
   so no one else can register.
3. **Authentication → Users → Add user**: create your account with your email and a
   password, and mark it **auto-confirm**.
4. Make sure **TOTP MFA** is enabled (Authentication → Multi-Factor; on by default).

### 2. Local environment

```bash
cp .env.local.example .env.local
```

Fill in `NEXT_PUBLIC_SUPABASE_ANON_KEY` from **Project Settings → API → anon public**.
The URL and your email are already filled in.

```bash
pnpm install
pnpm dev
```

Open http://localhost:3000:

1. Enter your password.
2. First login shows a **QR code** — scan it with Google Authenticator, then enter
   the 6-digit code. (Subsequent logins just ask for the code.)
3. You're in. Add bills and income; the dashboard updates.

## Deploy to GitHub Pages

1. Push this repo to GitHub.
2. **Settings → Secrets and variables → Actions**:
   - Variable `NEXT_PUBLIC_SUPABASE_URL` = `https://ecqrqrlupxgaulhpuclf.supabase.co`
   - Variable `NEXT_PUBLIC_AUTH_EMAIL` = your email
   - Variable `NEXT_PUBLIC_BASE_PATH` = `/<repo-name>` (e.g. `/budget`), or leave
     empty if using a custom domain or a `<user>.github.io` root repo
   - Secret `NEXT_PUBLIC_SUPABASE_ANON_KEY` = your anon key
3. **Settings → Pages → Build and deployment → Source**: select **GitHub Actions**.
4. Push to `main`. The [deploy workflow](.github/workflows/deploy.yml) builds the
   static site and publishes it.

> Add your deployed Pages URL to Supabase **Authentication → URL Configuration →
> Redirect URLs / Site URL** if you later add email-based flows. (Not required for
> password + TOTP.)

## Scripts

| Command          | Description                          |
| ---------------- | ------------------------------------ |
| `pnpm dev`       | Run the dev server                   |
| `pnpm build`     | Static export to `out/`              |
| `pnpm typecheck` | TypeScript check                     |
| `pnpm lint`      | ESLint                               |

## Data model

The whole budget is a **single recurring Jan–Dec template** (no per-year data).

- **categories**: reorderable groups per `kind` (`name`, `sort_order`).
- **payment_methods**: a managed pick-list (`name`).
- **entries**: `kind` (`bill`/`income`), `name`, `category_id`, `method_id`,
  `due_day` (1–31), `is_recurring`, `default_amount`, `is_active`, `is_salary`,
  `sort_order`.
- **entry_amounts**: per-month overrides — `entry_id`, `month` (1–12), `amount`
  (unique per entry/month).

Effective amount for a month = the `entry_amounts` override if present, else the
recurring `default_amount` (or the computed salary value), else 0 (one-time
entries with no value that month).

The Bills/Income grids render entries grouped under category bands (each with its
own 12 monthly subtotals, like a spreadsheet). Drag the ⋮⋮ handle to reorder
rows or categories, or drop a row onto a category band to move it there.

- **Recurring** entries fill every month with `default_amount`; edit a single
  month's cell in the grid to override just that month.
- **One-time** entries have `is_recurring = false`; their amount lives only in the
  month(s) you enter.

The Bills/Income pages show an Excel-style year grid (12 month columns + Total +
Average, with a year switcher). The dashboard leads with the selected month and
shows the full-year savings/spending summary below.

### Salary calculator

- **salary_settings**: per-user, per-year profile — `yearly_salary`, `tax_pct`,
  `half_tax_pct`, `vacation_rate_pct`, the feriepenger/half-tax months, and the
  vacation-day constants (`workdays_per_month` 26, `vacation_days` 25,
  `deduction_days` 4). Defaults reproduce the Norwegian 5-week model.
- The Income page has a **Salary calculator** card. Enter yearly-gross (or
  monthly-net) + tax %, and it computes monthly after-tax, the half-tax month,
  and **feriepenger** using your formulas:
  - `vacationBasis = monthlyBeforeTax × (12 − vacationDays/workdays)`
  - `feriepenger = vacationBasis × vacationRate − (monthlyBeforeTax/workdays) × deductionDays`
- Saving it creates an auto-linked **Salary** income row (`entries.is_salary`)
  whose 12 months are **computed** from the profile (feriepenger in June,
  half-tax in November, after-tax the rest). Change the settings and the row
  recomputes. Any manual per-month override still wins.
- Drag a result chip onto a month cell, or drag any cell onto another, to copy a
  value (creates an override).
