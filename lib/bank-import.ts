"use client"

// Bank → transaction list. Uses the staged bank data (bank_raw_transactions,
// which is kept forever and never changed) and adds to public.transactions ONLY
// the transactions the list doesn't already have, decided by lib/reconcile.ts.
//
// Safety:
//  * insert-only — never updates or deletes a row
//  * booked rows only; counted per (account, date, amount), so repeats are exact
//  * look-alikes nearby are HELD for review instead of added
//  * a fixed dedup_key per bank transaction + ON CONFLICT DO NOTHING, so running
//    twice (or two tabs at once) can't add anything twice
//  * more than MAX_AUTO new rows in one go → nothing is added, review instead

import { mutate } from "swr"

import {
  type BankTx,
  type ReconcileResult,
  bankText,
  bankTransactions,
  counterpartAccount,
  dayNum,
  reconcile,
  txLeg,
} from "@/lib/reconcile"
import type { StagedRaw } from "@/lib/reconcile"
import {
  fetchMatchRules,
  fetchTransactions,
  fetchTxRules,
} from "@/lib/data/transactions"
import { isInternalTx, matchRuleFor, ruleCategoryFor } from "@/lib/spending"
import { getSupabase } from "@/lib/supabase/client"
import type { Transaction } from "@/lib/types"

export const MAX_AUTO = 200

type Existing = ReturnType<typeof txLeg> & { tx: Transaction }

export type BankPlan = ReconcileResult<BankTx, Existing>

export async function fetchStaged(): Promise<StagedRaw[]> {
  const out: StagedRaw[] = []
  const page = 1000
  for (let from = 0; ; from += page) {
    const { data, error } = await getSupabase()
      .from("bank_raw_transactions")
      .select(
        "id, account_key, raw, raw_hash, copies, first_seen_at, last_seen_at",
      )
      .order("first_seen_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + page - 1)
    if (error) throw error
    out.push(...((data ?? []) as StagedRaw[]))
    if (!data || data.length < page) break
  }
  return out
}

export function planBankImport(
  staged: StagedRaw[],
  txs: Transaction[],
): BankPlan {
  const existing: Existing[] = txs.map((t) => ({ ...txLeg(t), tx: t }))
  return reconcile(bankTransactions(staged), existing)
}

/** A transactions row for a bank transaction. Fields the bank doesn't provide stay empty. */
function toRow(b: BankTx, importId: string) {
  const other = counterpartAccount(b.raw)
  const out = b.cents < 0
  const code = (b.raw.bank_transaction_code as { code?: string } | null)?.code
  const currency =
    (b.raw.transaction_amount as { currency?: string } | undefined)?.currency ??
    "NOK"
  const row = {
    import_id: importId,
    source: "bank",
    booked_date: b.date,
    tx_date: null,
    tx_at: null, // the bank API has no purchase time
    is_booked: true,
    // Bank code 200 is always a plain transfer ("Overføring" in the CSV); other
    // codes don't map to one CSV type, so they're left empty.
    type: code === "200" ? "Overføring" : null,
    description: bankText(b.raw) || null,
    message: null,
    amount: b.cents / 100,
    currency,
    from_account: out ? b.account : other,
    to_account: out ? other : b.account,
    is_internal: false,
    dedup_key: `bank:${b.account}:${b.date}:${b.cents}:${b.occurrence}`,
    identity_key: "bank",
  }
  row.is_internal = isInternalTx(row)
  return row
}

let running: Promise<BankImportResult> | null = null

export type BankImportResult = { added: number; held: number; tooMany: boolean }

/**
 * Add the bank's new transactions to the list. Safe to call any time — it only
 * adds what's missing. Concurrent calls share one run.
 */
export function runBankImport(): Promise<BankImportResult> {
  running ??= doImport().finally(() => {
    running = null
  })
  return running
}

async function doImport(): Promise<BankImportResult> {
  const supabase = getSupabase()
  const [staged, txs, rules, matchRules] = await Promise.all([
    fetchStaged(),
    fetchTransactions(),
    fetchTxRules(),
    fetchMatchRules(),
  ])
  const plan = planBankImport(staged, txs)
  if (!plan.fresh.length) {
    return { added: 0, held: plan.held.length, tooMany: false }
  }
  if (plan.fresh.length > MAX_AUTO) {
    return { added: 0, held: plan.held.length, tooMany: true }
  }

  const { data: imp, error: impErr } = await supabase
    .from("imports")
    .insert({
      label: `Bank ${new Date().toLocaleDateString("nb-NO")}`,
      filename: "bank (Enable Banking)",
      row_count: plan.fresh.length,
    })
    .select("id")
    .single()
  if (impErr) throw impErr

  const rows = plan.fresh.map((b) => {
    const r = toRow(b, imp.id)
    return {
      ...r,
      category_id:
        matchRuleFor(r, matchRules)?.category_id ?? ruleCategoryFor(r, rules),
    }
  })
  const { data, error } = await supabase
    .from("transactions")
    .upsert(rows, { onConflict: "user_id,dedup_key", ignoreDuplicates: true })
    .select("id")
  if (error) throw error
  await mutate("transactions")
  await mutate("imports")
  return { added: data?.length ?? 0, held: plan.held.length, tooMany: false }
}

/** Add specific held bank transactions after review. */
export async function addHeld(items: BankTx[]): Promise<number> {
  if (!items.length) return 0
  const supabase = getSupabase()
  const [rules, matchRules] = await Promise.all([
    fetchTxRules(),
    fetchMatchRules(),
  ])
  const { data: imp, error: impErr } = await supabase
    .from("imports")
    .insert({
      label: "Bank (reviewed)",
      filename: "bank (Enable Banking)",
      row_count: items.length,
    })
    .select("id")
    .single()
  if (impErr) throw impErr
  const rows = items.map((b) => {
    const r = toRow(b, imp.id)
    return {
      ...r,
      category_id:
        matchRuleFor(r, matchRules)?.category_id ?? ruleCategoryFor(r, rules),
    }
  })
  const { data, error } = await supabase
    .from("transactions")
    .upsert(rows, { onConflict: "user_id,dedup_key", ignoreDuplicates: true })
    .select("id")
  if (error) throw error
  await mutate("transactions")
  return data?.length ?? 0
}

// ---------------------------------------------------------------- history check

export type HistoryIssue = {
  /** A list row the bank's data doesn't account for. NOT necessarily wrong —
   *  shown for information only; nothing is ever removed automatically. */
  tx: Transaction
  /** List rows with the same account + amount nearby that the bank DOES confirm. */
  confirmedNearby: Transaction[]
}

/**
 * Rows in the list that the bank says don't exist: same account, but no booked
 * bank transaction with that amount on/near that date. Only checks accounts the
 * bank covers, inside its date range, and not the last 7 days (still settling).
 */
export function historyIssues(
  plan: BankPlan,
  staged: StagedRaw[],
): HistoryIssue[] {
  const bank = bankTransactions(staged)
  const range = new Map<string, [number, number]>()
  for (const b of bank) {
    const d = dayNum(b.date)
    const r = range.get(b.account)
    range.set(b.account, r ? [Math.min(r[0], d), Math.max(r[1], d)] : [d, d])
  }
  const confirmed = [...plan.exact, ...plan.shifted].map((p) => p.existing)
  return plan.unmatched
    .filter((e) => {
      const r = range.get(e.account)
      const d = dayNum(e.date)
      return r && d >= r[0] && d <= r[1] - 7
    })
    .map((e) => ({
      tx: e.tx,
      confirmedNearby: confirmed
        .filter(
          (c) =>
            c.account === e.account &&
            c.cents === e.cents &&
            Math.abs(dayNum(c.date) - dayNum(e.date)) <= 10,
        )
        .map((c) => c.tx),
    }))
    .sort((a, b) => b.tx.booked_date.localeCompare(a.tx.booked_date))
}
