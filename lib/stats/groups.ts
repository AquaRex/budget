import { monthlySubtotals } from "@/lib/budget"
import { placementCategoryId } from "@/lib/spending"
import type { StatsData } from "@/lib/stats/compute"
import { monthStatusResolver } from "@/lib/stats/coverage"
import type { MonthStatus } from "@/lib/stats/types"
import { buildGroupIndex, classifyTransactions, type ClassifiedTx } from "@/lib/stats/flows"

export type GroupKind = "bill" | "income" | "savings"

export const NO_LABEL = "__nolabel__"
export const UNASSIGNED_BAND = "__unassigned__"

export type GroupRow = {
  key: string // placement category id, or "type:<bank type>" when unplaced
  name: string
  months: number[] // 12 monthly actuals
  total: number
  avg: number // mean over months with activity
  subRows: GroupRow[] // per-label breakdown; empty when nothing here is labelled
}

export type GroupBand = {
  key: string // group id, or UNASSIGNED_BAND
  name: string
  kind: GroupKind
  budget: number[] // 12 monthly budgeted amounts (0s for the Unassigned band)
  hasBudget: boolean
  actual: number[] // 12 monthly actuals
  // Signed so + is always good: bills under budget, extra income, extra savings.
  diff: number[]
  budgetTotal: number
  actualTotal: number
  diffTotal: number // all 12 months, future budget included
  // To date = only what the imported data can judge: complete months count in
  // full; partial, future and no-data months not at all (a half-imported month
  // or no data is not "under budget"). In the current month only settled
  // outcomes count: a bill overspend (money already gone) or an income/savings
  // surplus (money already in); pending amounts are left out either way.
  // budgetToDate is the budget of the complete months.
  budgetToDate: number
  diffToDate: number
  budgetAvg: number // total / 12
  actualAvg: number // total / 12
  rows: GroupRow[]
}

const zeros = () => Array(12).fill(0) as number[]
const sum = (values: number[]) => values.reduce((s, v) => s + v, 0)

/**
 * The Groups page matrix for one year, using the dashboard engine's
 * classification so a band's monthly actual equals the dashboard's figure for
 * that group: bill bands (and Unassigned) show net spend (refunds subtract,
 * own-account transfers only when counted), income bands show income, savings
 * bands show net saved. Groups with neither budget nor actuals are hidden;
 * Unassigned only shows when it has rows.
 */
export function computeGroupsMatrix(
  data: StatsData,
  year: number,
  today: string, // YYYY-MM-DD (local)
): { months: MonthStatus[]; bands: GroupBand[] } {
  const { statusOf } = monthStatusResolver(data.transactions, data.imports, today)
  const months = Array.from({ length: 12 }, (_, i) => statusOf(year, i + 1))
  const judged = (i: number) => months[i] === "complete"
  const index = buildGroupIndex(data.categories, data.labels, data.typeMap, data.bills, data.incomes)
  const catById = new Map(data.categories.map((c) => [c.id, c]))
  const labelById = new Map(data.labels.map((l) => [l.id, l]))
  const labelHome = new Map(data.labels.map((l) => [l.id, l.category_id]))
  const yearKey = String(year)
  const inYear = classifyTransactions(data.transactions, index).filter((f) => f.date.slice(0, 4) === yearKey)

  const rowsFor = (groupId: string | null, value: (f: ClassifiedTx) => number) => {
    const byCat = new Map<string, { row: GroupRow; subs: Map<string, GroupRow> }>()
    const totals = zeros()
    for (const f of inYear) {
      const v = value(f)
      if (f.groupId !== groupId || v === 0) {
        continue
      }
      const t = f.tx
      // Labelled charges roll up under the label's home category, so a label's
      // total spans every payment channel it was bought through.
      const placement = placementCategoryId(t, data.typeMap, labelHome)
      const key = placement ?? `type:${t.type ?? ""}`
      let entry = byCat.get(key)
      if (!entry) {
        const name = (placement && catById.get(placement)?.name) || t.type || "Uncategorised"
        entry = { row: emptyRow(key, name), subs: new Map() }
        byCat.set(key, entry)
      }
      const subKey = t.label_id ?? NO_LABEL
      let sub = entry.subs.get(subKey)
      if (!sub) {
        const subName = t.label_id ? labelById.get(t.label_id)?.name ?? "Label" : "No label"
        sub = emptyRow(subKey, subName)
        entry.subs.set(subKey, sub)
      }
      const month = Number(f.date.slice(5, 7)) - 1
      entry.row.months[month] += v
      sub.months[month] += v
      totals[month] += v
    }
    const rows = Array.from(byCat.values()).map(({ row, subs }) => {
      const subRows = Array.from(subs.values()).map(finishRow).sort((a, b) => b.total - a.total)
      return { ...finishRow(row), subRows: subRows.some((s) => s.key !== NO_LABEL) ? subRows : [] }
    })
    return { rows: rows.sort((a, b) => b.total - a.total), totals }
  }

  const band = (
    key: string,
    name: string,
    kind: GroupKind,
    budget: number[],
    hasBudget: boolean,
    rows: GroupRow[],
    actual: number[],
  ): GroupBand => {
    const sign = kind === "bill" ? -1 : 1
    const budgetTotal = sum(budget)
    const actualTotal = sum(actual)
    const diff = budget.map((b, i) => sign * (actual[i] - b))
    return {
      key,
      name,
      kind,
      budget,
      hasBudget,
      actual,
      diff,
      budgetTotal,
      actualTotal,
      diffTotal: sign * (actualTotal - budgetTotal),
      budgetToDate: sum(budget.filter((_, i) => judged(i))),
      diffToDate: sum(
        diff.map((d, i) => {
          if (judged(i)) {
            return d
          }
          if (months[i] === "current") {
            return kind === "bill" ? Math.min(0, d) : Math.max(0, d)
          }
          return 0
        }),
      ),
      budgetAvg: budgetTotal / 12,
      actualAvg: actualTotal / 12,
      rows,
    }
  }

  const out: GroupBand[] = []
  for (const g of index.groups) {
    const billItems = data.bills.filter((e) => e.category_id === g.id)
    const incomeItems = data.incomes.filter((e) => e.category_id === g.id)
    const incomeOnly = index.incomeOnly.has(g.id)
    const kind: GroupKind = g.is_savings ? "savings" : incomeOnly ? "income" : "bill"
    const budgetItems = incomeOnly ? incomeItems : billItems
    const value =
      kind === "savings"
        ? (f: ClassifiedTx) => f.saved
        : kind === "income"
          ? (f: ClassifiedTx) => f.income
          : (f: ClassifiedTx) => f.spent
    const { rows, totals } = rowsFor(g.id, value)
    out.push(band(g.id, g.name, kind, monthlySubtotals(budgetItems, data.ctx), budgetItems.length > 0, rows, totals))
  }

  const unassigned = rowsFor(null, (f) => f.spent)
  if (unassigned.rows.length > 0) {
    out.push(band(UNASSIGNED_BAND, "Unassigned", "bill", zeros(), false, unassigned.rows, unassigned.totals))
  }

  return { months, bands: out.filter((b) => b.hasBudget || b.rows.length > 0) }
}

function emptyRow(key: string, name: string): GroupRow {
  return { key, name, months: zeros(), total: 0, avg: 0, subRows: [] }
}

function finishRow(row: GroupRow): GroupRow {
  const total = sum(row.months)
  const active = row.months.filter((m) => m !== 0).length
  return { ...row, total, avg: active ? total / active : 0 }
}
