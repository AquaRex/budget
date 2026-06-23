import type { Category, Transaction, TxRule, TypeCategory } from "@/lib/types"
import type { ParsedTx } from "@/lib/csv"
import { getDateMode } from "@/lib/date-mode"

/** bank-type string -> budget category id. */
export type TypeMap = Map<string, string>

/**
 * The date to bucket a transaction by. In "bought" mode we use the card's
 * transaction timestamp (when you actually paid) and fall back to the booked
 * date for rows without one (transfers, invoices, interest); in "booked" mode
 * we always use the bank's booking date.
 */
export function effectiveDate(t: {
  booked_date: string
  tx_date: string | null
}): string {
  return getDateMode() === "booked" ? t.booked_date : t.tx_date ?? t.booked_date
}

export function buildTypeMap(rows: TypeCategory[]): TypeMap {
  return new Map(rows.map((r) => [r.bank_type, r.category_id]))
}

/**
 * The group a category rolls up into:
 *   - if the category is itself a group (used by Bills/Income) -> itself,
 *   - else its assigned group_id,
 *   - else null (Unassigned).
 */
export function groupOfCategory(
  categoryId: string | null,
  groupIds: Set<string>,
  catById: Map<string, Category>,
): string | null {
  if (!categoryId) return null
  if (groupIds.has(categoryId)) return categoryId
  return catById.get(categoryId)?.group_id ?? null
}

/**
 * The category a transaction counts under, resolving in order:
 *   1. an explicit per-transaction category (manual / source rule),
 *   2. the bank-type's mapping,
 *   3. none (it stays ungrouped under its own bank type).
 */
export function effectiveCategoryId(
  t: { category_id: string | null; type: string | null },
  typeMap: TypeMap,
): string | null {
  if (t.category_id) return t.category_id
  if (t.type && typeMap.has(t.type)) return typeMap.get(t.type)!
  return null
}

/**
 * Where a transaction lands in the group view. A labelled charge rolls up under
 * its label's *home* category (so e.g. every "Path of Exile 2" payment totals
 * under Games regardless of how it was paid); otherwise it uses its own resolved
 * category. `labelHome` maps label id -> its category id (or null).
 */
export function placementCategoryId(
  t: { category_id: string | null; type: string | null; label_id: string | null },
  typeMap: TypeMap,
  labelHome: Map<string, string | null>,
): string | null {
  if (t.label_id) {
    const home = labelHome.get(t.label_id)
    if (home) return home
  }
  return effectiveCategoryId(t, typeMap)
}

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

/**
 * Whether a description matches a stored pattern. Checks both the raw normalized
 * text and the digit-stripped stem, so a pattern like "compass hi" matches
 * "COMPASS 5105 HI" (interior store numbers) as well as trailing-number cases.
 */
export function descMatches(
  description: string | null,
  pattern: string,
): boolean {
  if (!pattern) return false
  return (
    normalizeText(description).includes(pattern) ||
    deriveStem(description).includes(pattern)
  )
}

export type SourceKey = { matchType: "description" | "account"; pattern: string }

/**
 * The stable "source" of a transaction used to group/auto-categorise it:
 * a merchant/creditor description stem when present, else the counterparty
 * account number. Returns null when neither is available.
 */
export function sourceKeyFor(tx: TxLike): SourceKey | null {
  const stem = deriveStem(tx.description)
  if (stem) return { matchType: "description", pattern: stem }
  const acct = tx.to_account || tx.from_account
  if (acct) return { matchType: "account", pattern: acct }
  return null
}

/** Does a transaction match a (matchType, pattern) source? */
export function txMatchesSource(
  tx: TxLike,
  matchType: "description" | "account",
  pattern: string,
): boolean {
  if (matchType === "description") return descMatches(tx.description, pattern)
  return pattern === tx.from_account || pattern === tx.to_account
}

/** First matching rule's category for a transaction, or null. */
export function ruleCategoryFor(tx: TxLike, rules: TxRule[]): string | null {
  for (const r of rules) {
    if (!r.category_id) continue
    if (r.match_type === "description") {
      if (descMatches(tx.description, r.pattern)) return r.category_id
    } else {
      if (r.pattern === tx.from_account || r.pattern === tx.to_account)
        return r.category_id
    }
  }
  return null
}

/**
 * A merchant — the unit you triage in the Organize workspace. All transactions
 * sharing a source (merchant stem or counterparty account) are folded together
 * so one category decision covers every past and future charge from them.
 */
export type MerchantGroup = {
  key: string
  matchType: "description" | "account"
  pattern: string
  name: string // representative description for display
  txns: Transaction[]
  count: number
  spent: number // sum of outflows (|amount| for money out)
  sample: Transaction // representative row to categorise the whole source by
}

export function groupByMerchant(transactions: Transaction[]): MerchantGroup[] {
  const m = new Map<string, MerchantGroup>()
  for (const t of transactions) {
    const src = sourceKeyFor(t)
    const key = src
      ? `${src.matchType}:${src.pattern}`
      : `type:${t.type ?? "?"}`
    let g = m.get(key)
    if (!g) {
      g = {
        key,
        matchType: src?.matchType ?? "description",
        pattern: src?.pattern ?? "",
        name: t.description || t.type || "—",
        txns: [],
        count: 0,
        spent: 0,
        sample: t,
      }
      m.set(key, g)
    }
    g.txns.push(t)
    g.count++
    if (Number(t.amount) < 0) g.spent += -Number(t.amount)
  }
  return Array.from(m.values()).sort((a, b) => b.spent - a.spent)
}

export type ImportUpdate = { existing: Transaction; incoming: ParsedTx }

export type ImportPlan = {
  toInsert: ParsedTx[]
  toUpdate: ImportUpdate[]
  unchangedCount: number
}

type FpRow = {
  booked_date: string
  tx_at: string | null
  amount: number
  currency: string
  from_account: string | null
  to_account: string | null
  type: string | null
  description: string | null
  message: string | null
}

/** Identical-looking line (skip if unchanged). */
function fpExact(t: FpRow): string {
  return [
    t.booked_date,
    t.tx_at ?? "",
    Number(t.amount), // DB returns numeric as a string; normalise both sides
    t.currency,
    t.from_account ?? "",
    t.to_account ?? "",
    t.type ?? "",
    t.description ?? "",
    t.message ?? "",
  ].join("|")
}

/**
 * Stable identity of the underlying transaction. For card purchases the
 * purchase timestamp + amount + account is the anchor (booking date, type and
 * description all change when it settles). Bank rows have no timestamp, so they
 * use the booking date + counterparty + amount.
 */
function fpStable(t: FpRow): string {
  const amt = Number(t.amount)
  if (t.tx_at) {
    return `c|${t.tx_at}|${amt}|${t.currency}|${t.from_account ?? ""}|${t.to_account ?? ""}`
  }
  return `b|${t.booked_date}|${amt}|${t.currency}|${t.from_account ?? ""}|${t.to_account ?? ""}|${t.type ?? ""}|${t.message ?? ""}`
}

/**
 * Looser key used only to settle a *pending* row whose amount also moved (e.g.
 * a foreign-currency charge re-priced on settlement). Ignores the amount.
 */
function fpLoose(t: FpRow): string {
  if (t.tx_at) {
    return `c|${t.tx_at}|${t.currency}|${t.from_account ?? ""}|${t.to_account ?? ""}`
  }
  return `b|${t.currency}|${t.from_account ?? ""}|${t.to_account ?? ""}|${t.type ?? ""}|${t.message ?? ""}`
}

function pushTo<T>(map: Map<string, T[]>, key: string, value: T): void {
  const list = map.get(key)
  if (list) list.push(value)
  else map.set(key, [value])
}

/**
 * Reconcile freshly parsed rows against what's already stored:
 *  - identical line                       -> unchanged (skip)
 *  - same stable identity, details moved  -> update in place (e.g. settled)
 *  - pending row whose amount also moved  -> settle in place
 *  - otherwise                            -> insert
 * Matching is list/count based, so two genuinely identical same-minute charges
 * are both preserved.
 */
export function classifyImport(
  parsed: ParsedTx[],
  existing: Transaction[],
): ImportPlan {
  const byExact = new Map<string, Transaction[]>()
  const byStable = new Map<string, Transaction[]>()
  const byLoosePending = new Map<string, Transaction[]>()
  for (const t of existing) {
    pushTo(byExact, fpExact(t), t)
    pushTo(byStable, fpStable(t), t)
    if (!t.is_booked) pushTo(byLoosePending, fpLoose(t), t)
  }

  const used = new Set<string>()
  const take = (list: Transaction[] | undefined) =>
    list?.find((t) => !used.has(t.id))

  const toInsert: ParsedTx[] = []
  const toUpdate: ImportUpdate[] = []
  let unchangedCount = 0

  for (const row of parsed) {
    const exact = take(byExact.get(fpExact(row)))
    if (exact) {
      used.add(exact.id)
      if (exact.is_booked !== row.is_booked) toUpdate.push({ existing: exact, incoming: row })
      else unchangedCount++
      continue
    }
    const stable = take(byStable.get(fpStable(row)))
    if (stable) {
      used.add(stable.id)
      toUpdate.push({ existing: stable, incoming: row })
      continue
    }
    if (row.is_booked) {
      const settled = take(byLoosePending.get(fpLoose(row)))
      if (settled) {
        used.add(settled.id)
        toUpdate.push({ existing: settled, incoming: row })
        continue
      }
    }
    toInsert.push(row)
  }

  return { toInsert, toUpdate, unchangedCount }
}

/**
 * True for transfers between your own accounts (not real spending/income).
 * Derived so existing rows stay correct even if the stored flag is stale:
 * any "Overføring", "Overført fra …", "… mellom egne kontoer" or "Nettbank".
 */
export function isInternalTx(t: {
  is_internal?: boolean
  type?: string | null
  description?: string | null
  message?: string | null
}): boolean {
  if (t.is_internal) return true
  const hay = `${t.type ?? ""} ${t.description ?? ""} ${t.message ?? ""}`
    .toLowerCase()
  return (
    hay.includes("overf") || // Overføring / Overført fra
    hay.includes("mellom egne kontoer") ||
    hay.includes("nettbank")
  )
}

/** Spending transactions only: money out, not internal transfers / excluded. */
export function isSpending(t: Transaction): boolean {
  return !isInternalTx(t) && !t.is_excluded && Number(t.amount) < 0
}

/** True if this row has an unresolved proposed update from a later import. */
export function hasConflict(t: Transaction): boolean {
  return t.pending_amount != null
}

const periodOf = (t: Transaction) => effectiveDate(t).slice(0, 7) // YYYY-MM

/** Average actual spend per month, across every month that has spending. */
export function avgMonthlySpend(transactions: Transaction[]): {
  avg: number
  months: number
  total: number
} {
  const byPeriod = new Map<string, number>()
  for (const t of transactions) {
    if (!isSpending(t)) continue
    byPeriod.set(periodOf(t), (byPeriod.get(periodOf(t)) ?? 0) - Number(t.amount))
  }
  const vals = Array.from(byPeriod.values())
  const total = vals.reduce((s, v) => s + v, 0)
  return { avg: vals.length ? total / vals.length : 0, months: vals.length, total }
}

/** For each calendar month (1-12), the most recent YYYY-MM period with data. */
export function latestPeriodByMonth(
  transactions: Transaction[],
): Map<number, string> {
  const m = new Map<number, string>()
  for (const t of transactions) {
    const p = periodOf(t)
    const mo = Number(p.slice(5, 7))
    const cur = m.get(mo)
    if (!cur || p > cur) m.set(mo, p)
  }
  return m
}

export function spentInPeriod(
  transactions: Transaction[],
  period: string | undefined,
): number {
  if (!period) return 0
  let s = 0
  for (const t of transactions)
    if (periodOf(t) === period && isSpending(t)) s += -Number(t.amount)
  return s
}

export function incomeInPeriod(
  transactions: Transaction[],
  period: string | undefined,
): number {
  if (!period) return 0
  let s = 0
  for (const t of transactions)
    if (periodOf(t) === period && !isInternalTx(t) && Number(t.amount) > 0)
      s += Number(t.amount)
  return s
}

/** Actual spend per resolved category (null = ungrouped) for one period. */
export function actualByCategory(
  transactions: Transaction[],
  period: string | undefined,
  typeMap: TypeMap,
): Map<string | null, number> {
  const m = new Map<string | null, number>()
  if (!period) return m
  for (const t of transactions) {
    if (periodOf(t) !== period || !isSpending(t)) continue
    const ec = effectiveCategoryId(t, typeMap)
    m.set(ec, (m.get(ec) ?? 0) - Number(t.amount))
  }
  return m
}
