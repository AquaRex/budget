import type { Entry, EntryAmount } from "@/lib/types"
import { salaryMonthlyNet, type SalaryProfile } from "@/lib/salary"

export const MONTHS_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const

export const MONTHS_LONG = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const

/** Map keyed by `${entryId}:${month}` -> amount (single recurring template). */
export type AmountMap = Map<string, number>

export function amountKey(entryId: string, month: number): string {
  return `${entryId}:${month}`
}

export function buildAmountMap(amounts: EntryAmount[]): AmountMap {
  const map: AmountMap = new Map()
  for (const a of amounts) {
    map.set(amountKey(a.entry_id, a.month), Number(a.amount))
  }
  return map
}

/** Everything needed to resolve an entry's amount for any month. */
export type BudgetContext = {
  amounts: AmountMap
  /** Salary profile used for the entry flagged is_salary (null if unset). */
  salary: SalaryProfile | null
}

/** Whether this entry has an explicit per-month value (override / one-time). */
export function hasOverride(
  map: AmountMap,
  entryId: string,
  month: number,
): boolean {
  return map.has(amountKey(entryId, month))
}

/** True when the entry produces a value every month by default (not one-time). */
export function isFilledEveryMonth(entry: Entry): boolean {
  return entry.is_recurring || entry.is_salary
}

/** The computed default for a month, before any manual override. */
export function baseAmount(
  entry: Entry,
  ctx: BudgetContext,
  month: number,
): number {
  if (entry.is_salary) {
    return ctx.salary ? salaryMonthlyNet(ctx.salary, month) : 0
  }
  if (entry.is_recurring) return Number(entry.default_amount)
  return 0
}

/**
 * Effective amount for a given month: an explicit override if present,
 * otherwise the computed base (salary / recurring default / 0).
 */
export function effectiveAmount(
  entry: Entry,
  ctx: BudgetContext,
  month: number, // 1-12
): number {
  const override = ctx.amounts.get(amountKey(entry.id, month))
  if (override !== undefined) return override
  return baseAmount(entry, ctx, month)
}

/** The 12 effective amounts (Jan..Dec) for an entry. */
export function rowMonthlyAmounts(entry: Entry, ctx: BudgetContext): number[] {
  return Array.from({ length: 12 }, (_, i) => effectiveAmount(entry, ctx, i + 1))
}

export function rowTotal(values: number[]): number {
  return values.reduce((s, v) => s + v, 0)
}

/**
 * Average across months that have a value (Excel AVERAGE ignores blanks).
 * Entries filled every month average over all 12; one-time rows only where set.
 */
export function rowAverage(
  entry: Entry,
  ctx: BudgetContext,
  values: number[],
): number {
  if (isFilledEveryMonth(entry)) {
    return rowTotal(values) / 12
  }
  let count = 0
  let sum = 0
  for (let m = 1; m <= 12; m++) {
    if (hasOverride(ctx.amounts, entry.id, m)) {
      count++
      sum += values[m - 1]
    }
  }
  return count > 0 ? sum / count : 0
}

/** Sum of effective amounts for active entries, for a month. */
export function monthTotal(
  entries: Entry[],
  ctx: BudgetContext,
  month: number,
): number {
  return entries.reduce(
    (s, e) => (e.is_active ? s + effectiveAmount(e, ctx, month) : s),
    0,
  )
}

/** The 12 monthly subtotals for a set of entries (e.g. one category). */
export function monthlySubtotals(
  entries: Entry[],
  ctx: BudgetContext,
): number[] {
  return Array.from({ length: 12 }, (_, i) => monthTotal(entries, ctx, i + 1))
}

/** Sum across all 12 months for active entries. */
export function annualTotal(entries: Entry[], ctx: BudgetContext): number {
  let total = 0
  for (let m = 1; m <= 12; m++) total += monthTotal(entries, ctx, m)
  return total
}

export type MonthPoint = {
  month: string // short label
  income: number
  expenses: number
  net: number
  balance: number // cumulative running balance (ending balance)
}

/** Per-month income, expenses, net savings and the running ending balance. */
export function monthlySeries(
  incomes: Entry[],
  bills: Entry[],
  ctx: BudgetContext,
): MonthPoint[] {
  let balance = 0
  return MONTHS_SHORT.map((label, i) => {
    const m = i + 1
    const income = monthTotal(incomes, ctx, m)
    const expenses = monthTotal(bills, ctx, m)
    const net = income - expenses
    balance += net
    return { month: label, income, expenses, net, balance }
  })
}
