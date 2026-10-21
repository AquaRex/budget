import type {
  CategoryHistory,
  Flow,
  DayStat,
  MonthStat,
  PeriodSummary,
} from "@/lib/stats/types"
import { formatNumber } from "@/lib/format"

export const up = "text-emerald-600 dark:text-emerald-400"
export const down = "text-rose-600 dark:text-rose-400"

export function pct(rate: number | null, digits = 0): string {
  if (rate == null) {
    return "—"
  }
  return `${(rate * 100).toFixed(digits)}%`
}

export function signedPct(rate: number | null): string {
  if (rate == null) {
    return "—"
  }
  const v = Math.round(rate * 100)
  return `${v > 0 ? "+" : v < 0 ? "−" : "±"}${Math.abs(v)}%`
}

export function kr(amount: number): string {
  return `${formatNumber(amount)} kr`
}

export function signedKr(amount: number): string {
  const r = Math.round(amount)
  return `${r > 0 ? "+" : r < 0 ? "−" : ""}${formatNumber(Math.abs(r))} kr`
}

/** Axis ticks: 0 / 850 / 12k / 1.2M */
export function compact(v: number): string {
  const a = Math.abs(v)
  if (a >= 1_000_000) {
    return `${(v / 1_000_000).toFixed(1)}M`
  }
  if (a >= 10_000) {
    return `${Math.round(v / 1000)}k`
  }
  if (a >= 1000) {
    return `${(v / 1000).toFixed(1)}k`
  }
  return String(Math.round(v))
}

const shortDate = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
})
const longDate = new Intl.DateTimeFormat("en-GB", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
})

export function parseDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number)
  return new Date(y, m - 1, d)
}

export function formatShortDate(iso: string): string {
  return shortDate.format(parseDate(iso))
}

export function formatLongDate(iso: string): string {
  return longDate.format(parseDate(iso))
}

export function isoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
}

export function periodKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`
}

export function categoryKey(id: string | null): string {
  return id ?? "none"
}

export const OTHER_KEY = "__other"
const CATEGORY_SLOTS = 7

export type CategoryPalette = {
  keys: string[] // top categories in colour order, then OTHER_KEY when folded
  names: Record<string, string>
  color: (id: string | null) => string
}

/**
 * Fixed colour per category for the year: ranked by yearly total so colours
 * follow the entity across charts; the tail folds into a neutral "Other".
 */
export function categoryPalette(history: CategoryHistory): CategoryPalette {
  const totals = new Map<string, number>()
  for (const m of history.months) {
    for (const [k, v] of Object.entries(m.values)) {
      totals.set(k, (totals.get(k) ?? 0) + v)
    }
  }
  const names: Record<string, string> = { [OTHER_KEY]: "Other" }
  for (const c of history.categories) {
    names[categoryKey(c.id)] = c.name
  }
  const ranked = [...totals.entries()]
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([k]) => k)
  const top = ranked.slice(0, CATEGORY_SLOTS)
  const slot = new Map(top.map((k, i) => [k, i]))
  const keys = ranked.length > CATEGORY_SLOTS ? [...top, OTHER_KEY] : top
  return {
    keys,
    names,
    color: (id) => {
      const i = slot.get(categoryKey(id))
      return i == null ? "var(--viz-other)" : `var(--viz-cat-${i + 1})`
    },
  }
}

export type HeatScale = {
  thresholds: number[] // upper bounds of buckets 1..4; bucket 5 is above
  bucket: (spent: number) => number // 0 = no spend, 1..5
}

/**
 * Quantile buckets over the covered days that had spending, so a few huge days
 * (rent, travel) don't flatten everything else into the lowest colour.
 */
export function heatScale(
  days: DayStat[],
  isCovered: (d: DayStat) => boolean,
): HeatScale {
  const values = days
    .filter((d) => d.spent > 0 && isCovered(d))
    .map((d) => d.spent)
    .sort((a, b) => a - b)
  const q = (p: number) => values[Math.floor(p * (values.length - 1))] ?? 0
  const thresholds = [q(0.2), q(0.4), q(0.6), q(0.8)]
  return {
    thresholds,
    bucket: (spent) => {
      if (spent <= 0) {
        return 0
      }
      const i = thresholds.findIndex((t) => spent <= t)
      return i === -1 ? 5 : i + 1
    },
  }
}

/** A day counts as covered when it falls inside the imported data window. */
export function coverage(dataFrom: string | null, dataThrough: string | null) {
  return (d: DayStat) =>
    dataFrom != null &&
    dataThrough != null &&
    d.date >= dataFrom &&
    d.date <= dataThrough
}

/**
 * The month's glance number. Mid-month, actual income − spent is misleading
 * (salary and bills still to come, savings set aside), so the current month
 * shows what's expected to be left after pending income, bills and savings.
 */
export function leftThisMonth(
  month: MonthStat | undefined,
  summary: PeriodSummary,
  pending: {
    expectedIncome: number | null
    upcomingBills: number | null
    reservedSavings: number | null
  },
) {
  if (month?.status === "current") {
    const income = pending.expectedIncome ?? summary.income
    const bills = pending.upcomingBills ?? 0
    const reserved = pending.reservedSavings ?? 0
    const incomeToCome = Math.max(0, income - summary.income)
    const value = income - summary.spent - bills - reserved
    const isPending = incomeToCome > 0 || bills > 0
    const notes = [
      incomeToCome > 0 ? `${kr(incomeToCome)} income to come` : null,
      bills > 0 ? `${kr(bills)} bills to come` : null,
      reserved > 0 ? `${kr(reserved)} set aside` : null,
    ].filter(Boolean)
    return {
      label: isPending ? "Left after bills (expected)" : "Left this month",
      note: notes.length ? notes.join(" · ") : null,
      value,
      // The ring is a savings rate, so money set aside counts as kept.
      rate: income > 0 ? (value + reserved) / income : null,
      expected: isPending,
    }
  }
  return {
    label:
      month?.status === "complete"
        ? "Kept this month"
        : month?.status === "partial"
          ? "Net (partial data)"
          : "Net",
    note: null,
    value: summary.net,
    rate: summary.savingsRate,
    expected: false,
  }
}

export type MonthLeft = ReturnType<typeof leftThisMonth>

/** How a transaction counts, for list rows; null for plain spending. */
export function flowLabel(row: { flow: Flow; counted: boolean }): string | null {
  switch (row.flow) {
    case "income":
      return "Income"
    case "refund":
      return "Refund"
    case "saved":
      return "Saved"
    case "transfer":
      return row.counted ? "Transfer" : "Transfer · not counted"
    default:
      return null
  }
}
