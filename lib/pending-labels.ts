"use client"

// Tags put on a purchase while it's still pending at the bank. Pending rows are
// never stored as transactions, so the tag is kept as a note here and handed to
// the booked row AS IT IS INSERTED (bank or CSV import). Existing transactions
// are never changed by this.

import { dayNum, digits, toCents } from "@/lib/reconcile"
import { getSupabase } from "@/lib/supabase/client"

export type PendingLabel = {
  id: string
  pending_key: string
  account_number: string
  booked_date: string
  amount: number
  description: string | null
  label_id: string
}

export async function fetchPendingLabels(): Promise<PendingLabel[]> {
  const { data, error } = await getSupabase()
    .from("pending_labels")
    .select(
      "id, pending_key, account_number, booked_date, amount, description, label_id",
    )
    .is("used_at", null)
  if (error) return [] // table not created yet
  return (data ?? []) as PendingLabel[]
}

/** Tag (or untag, with null) a pending row. */
export async function savePendingLabel(
  tx: {
    id: string
    amount: number | string
    from_account: string | null
    to_account: string | null
    booked_date: string
    description: string | null
  },
  labelId: string | null,
): Promise<void> {
  const supabase = getSupabase()
  if (!labelId) {
    const { error } = await supabase
      .from("pending_labels")
      .delete()
      .eq("pending_key", tx.id)
      .is("used_at", null)
    if (error) throw error
    return
  }
  const amount = Number(tx.amount)
  const { error } = await supabase.from("pending_labels").upsert(
    {
      pending_key: tx.id,
      account_number: digits(amount < 0 ? tx.from_account : tx.to_account),
      booked_date: tx.booked_date,
      amount,
      description: tx.description,
      label_id: labelId,
      used_at: null,
    },
    { onConflict: "user_id,pending_key" },
  )
  if (error) throw error
}

const norm = (s: string | null | undefined) =>
  (s ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9æøå]+/g, " ")
    .trim()

type NewRow = {
  amount: number
  from_account: string | null
  to_account: string | null
  booked_date: string
  description: string | null
  label_id?: string | null
}

/**
 * Give waiting pending-tags to rows about to be inserted. A row matches a note
 * when it's the same account, within 7 days, and either the same amount, or the
 * same merchant text with an amount within 15% (foreign-currency purchases can
 * book slightly differently). Each note is used once. Call markPendingLabelsUsed
 * with the returned ids only after the insert succeeded.
 */
export async function applyPendingLabels<T extends NewRow>(
  rows: T[],
): Promise<{ rows: T[]; usedIds: string[] }> {
  const notes = await fetchPendingLabels()
  if (!notes.length || !rows.length) return { rows, usedIds: [] }
  const used = new Set<string>()
  const out = rows.map((r) => {
    if (r.label_id) return r
    const cents = toCents(r.amount)
    const acct = digits(cents < 0 ? r.from_account : r.to_account)
    const d = dayNum(r.booked_date)
    const cands = notes
      .filter((n) => !used.has(n.id) && n.account_number === acct)
      .map((n) => {
        const nc = toCents(n.amount)
        const days = d - dayNum(n.booked_date)
        const sameAmount = nc === cents
        const sameText =
          norm(n.description) !== "" &&
          norm(n.description) === norm(r.description)
        const close =
          Math.sign(nc) === Math.sign(cents) &&
          Math.abs(nc - cents) <= Math.abs(nc) * 0.15
        return {
          n,
          days,
          ok: days >= -1 && days <= 7 && (sameAmount || (sameText && close)),
          score: (sameAmount ? 0 : 1000) + Math.abs(days),
        }
      })
      .filter((c) => c.ok)
      .sort((a, b) => a.score - b.score)
    const hit = cands[0]
    if (!hit) return r
    used.add(hit.n.id)
    return { ...r, label_id: hit.n.label_id }
  })
  return { rows: out, usedIds: [...used] }
}

export async function markPendingLabelsUsed(ids: string[]): Promise<void> {
  if (!ids.length) return
  await getSupabase()
    .from("pending_labels")
    .update({ used_at: new Date().toISOString() })
    .in("id", ids)
}
