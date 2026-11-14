"use client"

// Purchases the bank has reserved but not booked yet. They are money that has
// already left the account, so they are shown in the transaction list and count
// in every total — but they are NEVER stored in public.transactions. They are
// built fresh from the latest bank pull each time:
//   * booked by the bank → it drops out here and the booked row is imported
//     (with the final amount, so a changed amount can't create a duplicate)
//   * cancelled by the bank → it simply drops out
// Rows already in the list (e.g. a pending row from a CSV import) are not shown
// twice.

import { getDemoMode } from "@/lib/demo-mode"
import {
  PENDING_ID_PREFIX,
  accountFromKey,
  bankText,
  counterpartAccount,
  rawCents,
  reconcile,
  txLeg,
} from "@/lib/reconcile"
import { isInternalTx, matchRuleFor, ruleCategoryFor } from "@/lib/spending"
import { getSupabase } from "@/lib/supabase/client"
import type { MatchRule, Transaction, TxRule } from "@/lib/types"

export type PendingRaw = {
  id: string
  account_key: string
  raw: Record<string, unknown>
  copies: number
}

/** Pending rows from the most recent successful bank pull. */
export async function fetchCurrentPending(): Promise<PendingRaw[]> {
  if (getDemoMode() !== "off") return [] // bank data isn't scrambled for demos
  const supabase = getSupabase()
  const { data: fetches, error: fErr } = await supabase
    .from("bank_fetches")
    .select("id, status")
    .in("status", ["ok", "partial"])
    .order("started_at", { ascending: false })
    .limit(1)
  if (fErr) return [] // bank tables not set up — no pending rows
  const latest = fetches?.[0]?.id
  if (!latest) return []
  const { data, error } = await supabase
    .from("bank_raw_transactions")
    .select("id, account_key, raw, copies")
    .eq("last_fetch_id", latest)
    .eq("raw->>status", "PDNG")
  if (error) return []
  return (data ?? []) as PendingRaw[]
}

/** The pending rows as list rows (marked is_booked = false, virtual ids). */
export function pendingAsTransactions(
  pending: PendingRaw[],
  stored: Transaction[],
  rules: TxRule[],
  matchRules: MatchRule[],
): Transaction[] {
  const rows: {
    account: string
    date: string
    cents: number
    t: Transaction
  }[] = []
  for (const p of pending) {
    const cents = rawCents(p.raw)
    const date = String(p.raw.booking_date ?? p.raw.value_date ?? "")
    if (!cents || !date) continue
    const account = accountFromKey(p.account_key)
    const other = counterpartAccount(p.raw)
    const out = cents < 0
    const currency =
      (p.raw.transaction_amount as { currency?: string } | undefined)
        ?.currency ?? "NOK"
    for (let c = 0; c < p.copies; c++) {
      const t: Transaction = {
        id: `${PENDING_ID_PREFIX}${p.id}:${c}`,
        user_id: "",
        import_id: null,
        booked_date: date,
        tx_date: date,
        tx_at: null,
        is_booked: false,
        type: null,
        description: bankText(p.raw) || null,
        message: null,
        amount: cents / 100,
        currency,
        from_account: out ? account : other,
        to_account: out ? other : account,
        category_id: null,
        label_id: null,
        is_internal: false,
        is_excluded: false,
        dedup_key: "",
        identity_key: "",
        pending_amount: null,
        pending_booked_date: null,
        created_at: new Date().toISOString(),
        source: "bank",
      }
      t.is_internal = isInternalTx(t)
      t.category_id =
        matchRuleFor(t, matchRules)?.category_id ?? ruleCategoryFor(t, rules)
      rows.push({ account, date, cents, t })
    }
  }
  if (!rows.length) return []
  // Leave out any that already have a look-alike in the stored list.
  const fresh = reconcile(
    rows,
    stored.map((t) => txLeg(t)),
  ).fresh
  return fresh.map((r) => r.t)
}
