import type { Category, Entry, Label, Transaction } from "@/lib/types"
import {
  deriveStem,
  effectiveDate,
  groupOfCategory,
  isInternalTx,
  placementCategoryId,
  type TypeMap,
} from "@/lib/spending"
import { getCountTransfers } from "@/lib/count-transfers"
import type { StatsData } from "@/lib/stats/compute"
import type { DayTx, Flow } from "@/lib/stats/types"

export function merchantOf(t: Transaction): string {
  return deriveStem(t.description) || t.type || "Unknown"
}

/** A transaction classified once for every aggregate. */
export type ClassifiedTx = {
  tx: Transaction
  flow: Flow
  counted: boolean // false only for transfers while "count transfers" is off
  date: string // effective date, YYYY-MM-DD
  spent: number // > 0 purchase or counted transfer out, < 0 refund
  income: number
  saved: number // > 0 into a savings group, < 0 withdrawal
  transferOut: number // own-account transfers outside savings groups, counted or not
  transferIn: number
  groupId: string | null
  merchant: string
}

export type GroupIndex = {
  groups: Category[] // categories used by Bills/Income entries, in sort order
  nameOf: (groupId: string | null) => string
  groupOf: (t: Transaction) => string | null
  incomeOnly: Set<string> // groups used only by Income entries
  savings: Set<string> // groups flagged is_savings
}

export const UNASSIGNED_NAME = "Unassigned"

/** Groups exactly as the Groups page derives and places them. */
export function buildGroupIndex(
  categories: Category[],
  labels: Label[],
  typeMap: TypeMap,
  bills: Entry[],
  incomes: Entry[],
): GroupIndex {
  const billCats = new Set(bills.map((e) => e.category_id))
  const incomeCats = new Set(incomes.map((e) => e.category_id))
  const groups = categories
    .filter((c) => billCats.has(c.id) || incomeCats.has(c.id))
    .sort((a, b) => a.sort_order - b.sort_order)
  const groupIds = new Set(groups.map((g) => g.id))
  const catById = new Map(categories.map((c) => [c.id, c]))
  const labelHome = new Map(labels.map((l) => [l.id, l.category_id]))
  return {
    groups,
    nameOf: (groupId) => (groupId && catById.get(groupId)?.name) || UNASSIGNED_NAME,
    groupOf: (t) => {
      const group = groupOfCategory(placementCategoryId(t, typeMap, labelHome), groupIds, catById)
      // A group_id pointing at a category no Bills/Income entry uses this year
      // isn't a group, so that spend is unassigned rather than silently dropped.
      return group && groupIds.has(group) ? group : null
    },
    incomeOnly: new Set(groups.filter((g) => !billCats.has(g.id)).map((g) => g.id)),
    savings: new Set(groups.filter((g) => g.is_savings).map((g) => g.id)),
  }
}

/**
 * Classifies every non-excluded, non-zero row, in this order:
 *   saved    — placed in a savings group (transfer or not); out adds, in withdraws.
 *   transfer — own-account transfer; counts as spent (out) / income (in) only
 *              when the "count transfers" setting is on, else just tracked.
 *   spent    — any other money out.
 *   refund   — money in whose description stem equals a stem you've paid, or
 *              starts with one followed by a word break ("kiwi retur" matches
 *              "kiwi", "kiwiburger" doesn't), unless placed in an income-only
 *              group. Netted against spending on the day it lands so the savings
 *              rate isn't overstated. Deliberately conservative, since netting
 *              salary would wreck every figure: returns from a merchant never
 *              paid within the data, or under a different description, count
 *              as income.
 *   income   — any other money in.
 */
export function classifyTransactions(transactions: Transaction[], index: GroupIndex): ClassifiedTx[] {
  const countTransfers = getCountTransfers()
  const rows = transactions
    .filter((t) => !t.is_excluded && Number(t.amount) !== 0)
    .map((t) => ({ t, amount: Number(t.amount), groupId: index.groupOf(t), internal: isInternalTx(t) }))
  const stemsPaid = new Set<string>()
  for (const r of rows) {
    if (r.amount < 0 && !r.internal && !(r.groupId && index.savings.has(r.groupId))) {
      stemsPaid.add(deriveStem(r.t.description))
    }
  }
  stemsPaid.delete("")
  const isPaidStem = (stem: string) => {
    const words = stem.split(" ")
    for (let n = 1; n <= words.length; n++) {
      if (stemsPaid.has(words.slice(0, n).join(" "))) {
        return true
      }
    }
    return false
  }
  const flowOf = (r: (typeof rows)[number]): Flow => {
    if (r.groupId && index.savings.has(r.groupId)) {
      return "saved"
    }
    if (r.internal) {
      return "transfer"
    }
    if (r.amount < 0) {
      return "spent"
    }
    if (isPaidStem(deriveStem(r.t.description)) && !(r.groupId && index.incomeOnly.has(r.groupId))) {
      return "refund"
    }
    return "income"
  }
  return rows.map((r) => {
    const { t, amount, groupId } = r
    const flow = flowOf(r)
    const counted = flow !== "transfer" || countTransfers
    const isOut = amount < 0
    const countsAsSpent = flow === "spent" || flow === "refund" || (flow === "transfer" && counted && isOut)
    const countsAsIncome = flow === "income" || (flow === "transfer" && counted && !isOut)
    return {
      tx: t,
      flow,
      counted,
      date: effectiveDate(t),
      spent: countsAsSpent ? -amount : 0,
      income: countsAsIncome ? amount : 0,
      saved: flow === "saved" ? -amount : 0,
      transferOut: flow === "transfer" && isOut ? -amount : 0,
      transferIn: flow === "transfer" && !isOut ? amount : 0,
      groupId,
      merchant: merchantOf(t),
    }
  })
}

/** The day drill-down: every non-excluded row on `date` with how it counts, in time order. */
export function dayTransactions(data: StatsData, date: string): DayTx[] {
  const index = buildGroupIndex(data.categories, data.labels, data.typeMap, data.bills, data.incomes)
  return classifyTransactions(data.transactions, index)
    .filter((c) => c.date === date)
    .sort((a, b) => (a.tx.tx_at ?? a.date).localeCompare(b.tx.tx_at ?? b.date))
    .map((c) => ({ tx: c.tx, flow: c.flow, counted: c.counted }))
}
