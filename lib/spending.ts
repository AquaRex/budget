import type { Transaction, TxRule } from "@/lib/types"
import type { ParsedTx } from "@/lib/csv"

/** Lowercase + collapse whitespace, for stable rule matching. */
export function normalizeText(s: string | null | undefined): string {
  return (s ?? "").toLowerCase().replace(/\s+/g, " ").trim()
}

/**
 * A sensible default rule pattern from a description: drop digits, dates and
 * store numbers so "EXTRA PRESTAMARKA 879545" -> "extra prestamarka".
 */
export function deriveStem(desc: string | null | undefined): string {
  return normalizeText(desc)
    .replace(/\b\d{1,2}\.\d{1,2}(\.\d{2,4})?\b/g, " ") // dates like 24.10
    .replace(/\d+/g, " ") // any remaining digits / ids
    .replace(/[*#]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

type TxLike = {
  description: string | null
  from_account: string | null
  to_account: string | null
}

/** First matching rule's category for a transaction, or null. */
export function ruleCategoryFor(tx: TxLike, rules: TxRule[]): string | null {
  const desc = normalizeText(tx.description)
  for (const r of rules) {
    if (!r.category_id) continue
    if (r.match_type === "description") {
      if (r.pattern && desc.includes(r.pattern)) return r.category_id
    } else {
      if (r.pattern === tx.from_account || r.pattern === tx.to_account)
        return r.category_id
    }
  }
  return null
}

export type ImportConflict = { existing: Transaction; incoming: ParsedTx }

export type ImportPlan = {
  toInsert: ParsedTx[]
  conflicts: ImportConflict[]
  unchangedCount: number
}

/**
 * Compare freshly parsed rows against what's already stored:
 *  - exact match (dedup_key) -> already imported, no-op
 *  - same identity but different amount/date -> a conflict to resolve
 *  - otherwise -> a brand-new row to insert
 */
export function classifyImport(
  parsed: ParsedTx[],
  existing: Transaction[],
): ImportPlan {
  const byDedup = new Set(existing.map((t) => t.dedup_key))
  const byIdentity = new Map<string, Transaction[]>()
  for (const t of existing) {
    const list = byIdentity.get(t.identity_key)
    if (list) list.push(t)
    else byIdentity.set(t.identity_key, [t])
  }

  const usedExisting = new Set<string>()
  const seenDedup = new Set<string>()
  const toInsert: ParsedTx[] = []
  const conflicts: ImportConflict[] = []
  let unchangedCount = 0

  for (const row of parsed) {
    if (byDedup.has(row.dedup_key) || seenDedup.has(row.dedup_key)) {
      unchangedCount++
      continue
    }
    seenDedup.add(row.dedup_key)

    const candidates = (byIdentity.get(row.identity_key) ?? []).filter(
      (t) => !usedExisting.has(t.id),
    )
    const match = candidates[0]
    if (match) {
      usedExisting.add(match.id)
      const sameAmount = Number(match.amount) === row.amount
      const sameDate = match.booked_date === row.booked_date
      if (sameAmount && sameDate) {
        unchangedCount++
      } else {
        conflicts.push({ existing: match, incoming: row })
      }
    } else {
      toInsert.push(row)
    }
  }

  return { toInsert, conflicts, unchangedCount }
}

/** Spending transactions only: money out, not internal transfers / excluded. */
export function isSpending(t: Transaction): boolean {
  return !t.is_internal && !t.is_excluded && Number(t.amount) < 0
}

/** True if this row has an unresolved proposed update from a later import. */
export function hasConflict(t: Transaction): boolean {
  return t.pending_amount != null
}
