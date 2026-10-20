import type { Category, Entry, Label, Transaction } from "@/lib/types"
import {
  deriveStem,
  effectiveDate,
  groupOfCategory,
  isInternalTx,
  placementCategoryId,
  type TypeMap,
} from "@/lib/spending"

/** Real money movement: not an internal transfer, not excluded, not zero. */
export function isCounted(t: Transaction): boolean {
  return !isInternalTx(t) && !t.is_excluded && Number(t.amount) !== 0
}

export function merchantOf(t: Transaction): string {
  return deriveStem(t.description) || t.type || "Unknown"
}

/** A counted transaction, classified once for every aggregate. */
export type Flow = {
  date: string // effective date, YYYY-MM-DD
  spent: number // > 0 purchase, < 0 refund netted against spending, 0 for income
  income: number
  groupId: string | null
  merchant: string
}

export type GroupIndex = {
  groups: Category[] // categories used by Bills/Income entries, in sort order
  nameOf: (groupId: string | null) => string
  groupOf: (t: Transaction) => string | null
  incomeOnly: Set<string> // groups used only by Income entries
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
  }
}

/**
 * Card credits are refunds: money in on a card row (purchase timestamp) or
 * under a bank type your card purchases use (a return booked as a bank row),
 * plus money in from a merchant description you also pay. Refunds net against
 * spending on the day they land instead of inflating income, so the savings
 * rate isn't overstated. Salary and transfers from people are never card rows,
 * so they stay income; so does anything placed under an income-only group.
 */
export function buildFlows(transactions: Transaction[], index: GroupIndex): Flow[] {
  const counted = transactions.filter(isCounted)
  const stemsPaid = new Set<string>()
  const cardTypes = new Set<string | null>()
  for (const t of counted) {
    if (Number(t.amount) < 0) {
      stemsPaid.add(deriveStem(t.description))
      if (t.tx_at !== null) {
        cardTypes.add(t.type)
      }
    }
  }
  stemsPaid.delete("")
  cardTypes.delete(null)
  return counted.map((t) => {
    const amount = Number(t.amount)
    const groupId = index.groupOf(t)
    const isCardCredit = t.tx_at !== null || cardTypes.has(t.type)
    const isRefund =
      amount > 0 &&
      (isCardCredit || stemsPaid.has(deriveStem(t.description))) &&
      !(groupId && index.incomeOnly.has(groupId))
    const isIncome = amount > 0 && !isRefund
    return {
      date: effectiveDate(t),
      spent: isIncome ? 0 : -amount,
      income: isIncome ? amount : 0,
      groupId,
      merchant: merchantOf(t),
    }
  })
}

/** The day drill-down: every counted row on `date`, in time order. */
export function dayTransactions(transactions: Transaction[], date: string): Transaction[] {
  return transactions
    .filter((t) => isCounted(t) && effectiveDate(t) === date)
    .sort((a, b) => (a.tx_at ?? effectiveDate(a)).localeCompare(b.tx_at ?? effectiveDate(b)))
}
