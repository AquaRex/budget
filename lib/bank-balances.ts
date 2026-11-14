"use client"

// Account balances from the most recent bank pull, adjusted for purchases that
// are still pending. Balances and pending rows come from the SAME pull, so they
// are one consistent snapshot.
//
// "Real" balance = the bank's BOOKED balance (saldo, before reservations) plus
// that account's pending rows (negative for purchases). The bank's own
// AVAILABLE balance is shown next to it for comparison: it usually already
// subtracts reservations, but may also include a credit limit, so it isn't
// used as the real number.

import { getDemoMode } from "@/lib/demo-mode"
import { accountFromKey, rawCents } from "@/lib/reconcile"
import { getSupabase } from "@/lib/supabase/client"

type RawBalance = {
  name?: string
  balance_type?: string
  balance_amount?: { amount?: string; currency?: string }
  reference_date?: string
  last_change_date_time?: string
}

type SummaryAccount = {
  account_key: string
  product: string | null
  cash_account_type: string | null
  balances?: { balances?: RawBalance[]; error?: string }
}

// ISO 20022 balance types, most current first.
const BOOKED = ["ITBD", "CLBD", "OPBD", "PRCD"]
const AVAILABLE = ["ITAV", "CLAV", "FWAV", "OPAV"]

export type AccountBalance = {
  accountKey: string
  label: string
  currency: string
  /** Bank's booked balance (before reservations), or null if not sent. */
  booked: number | null
  bookedType: string | null
  /** Bank's own available balance, for comparison. */
  available: number | null
  availableType: string | null
  /** Sum of this account's pending rows (negative = reserved purchases). */
  pending: number
  pendingCount: number
  /** booked + pending; falls back to `available` when no booked balance is sent. */
  real: number | null
  basis: "booked-minus-pending" | "bank-available" | "none"
  error: string | null
  /** Every balance the bank sent, for transparency. */
  all: { type: string; amount: number }[]
}

export type BankBalances = {
  asOf: string | null
  accounts: AccountBalance[]
}

function pick(list: RawBalance[], order: string[]) {
  for (const t of order) {
    const b = list.find((x) => x.balance_type === t)
    if (b?.balance_amount?.amount != null) {
      return { type: t, amount: Number(b.balance_amount.amount) }
    }
  }
  return null
}

export async function fetchBankBalances(): Promise<BankBalances | null> {
  if (getDemoMode() !== "off") return null
  const supabase = getSupabase()
  const { data: fetches, error } = await supabase
    .from("bank_fetches")
    .select("id, finished_at, summary")
    .in("status", ["ok", "partial"])
    .order("started_at", { ascending: false })
    .limit(1)
  if (error || !fetches?.length) return null
  const f = fetches[0] as {
    id: string
    finished_at: string | null
    summary: { accounts?: SummaryAccount[] }
  }

  const { data: pend } = await supabase
    .from("bank_raw_transactions")
    .select("account_key, raw, copies")
    .eq("last_fetch_id", f.id)
    .eq("raw->>status", "PDNG")
  const pendingBy = new Map<string, { sum: number; n: number }>()
  for (const p of (pend ?? []) as {
    account_key: string
    raw: Record<string, unknown>
    copies: number
  }[]) {
    const c = rawCents(p.raw)
    if (c == null) continue
    const cur = pendingBy.get(p.account_key) ?? { sum: 0, n: 0 }
    cur.sum += (c * p.copies) / 100
    cur.n += p.copies
    pendingBy.set(p.account_key, cur)
  }

  const accounts: AccountBalance[] = (f.summary.accounts ?? []).map((a) => {
    const list = a.balances?.balances ?? []
    const booked = pick(list, BOOKED)
    const available = pick(list, AVAILABLE)
    const pending = pendingBy.get(a.account_key) ?? { sum: 0, n: 0 }
    const currency =
      list.find((b) => b.balance_amount?.currency)?.balance_amount?.currency ??
      "NOK"
    const real = booked
      ? Math.round((booked.amount + pending.sum) * 100) / 100
      : available
        ? available.amount
        : null
    return {
      accountKey: a.account_key,
      label: `${a.product || a.cash_account_type || "Account"} …${accountFromKey(a.account_key).slice(-4)}`,
      currency,
      booked: booked?.amount ?? null,
      bookedType: booked?.type ?? null,
      available: available?.amount ?? null,
      availableType: available?.type ?? null,
      pending: Math.round(pending.sum * 100) / 100,
      pendingCount: pending.n,
      real,
      basis: booked
        ? "booked-minus-pending"
        : available
          ? "bank-available"
          : "none",
      error: a.balances?.error ?? null,
      all: list
        .filter((b) => b.balance_amount?.amount != null)
        .map((b) => ({
          type: b.balance_type ?? b.name ?? "?",
          amount: Number(b.balance_amount!.amount),
        })),
    }
  })
  return { asOf: f.finished_at, accounts }
}
