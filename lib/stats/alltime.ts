// All-time statistics: every month from the first imported transaction to
// today, with the same classification and coverage rules as the month/year
// dashboard. Averages only use complete months, so a half-covered first month
// or the running current month never skews "a typical month".
import type {
  CategoryHistory,
  CategorySlice,
  MerchantStat,
  MonthStat,
  PeriodSummary,
} from "@/lib/stats/types"
import { categorySlices, summarize, type StatsData } from "@/lib/stats/compute"
import { monthStatusResolver } from "@/lib/stats/coverage"
import { buildGroupIndex, classifyTransactions, type ClassifiedTx } from "@/lib/stats/flows"
import { isoDate, ymKey } from "@/lib/stats/dates"

const TOP_MERCHANTS = 15
const ROLLING_MONTHS = 12
const NONE_KEY = "none"

export type YearStat = {
  year: number
  monthsComplete: number
  monthsWithData: number // complete + partial + current
  income: number // every month with data (complete or not)
  spent: number
  net: number
  saved: number
  savingsRate: number | null
  // Per complete month of that year (null when the year has none).
  avgMonthlyIncome: number | null
  avgMonthlySpent: number | null
  avgMonthlyNet: number | null
}

export type RollingPoint = {
  year: number
  month: number
  income: number | null // trailing 12-complete-month average; null until 12 exist
  spent: number | null
}

export type AllTimeStats = {
  hasData: boolean
  dataFrom: string | null
  dataThrough: string | null
  months: MonthStat[] // first data month .. current month; cumulativeNet runs over all of them
  years: YearStat[]
  summary: PeriodSummary // totals and averages over complete months
  deficitMonths: number // complete months where spent > income
  surplusMonths: number
  rolling: RollingPoint[]
  categories: CategorySlice[] // spending groups over complete months; baseline = per complete month
  categoryHistory: CategoryHistory // one row per year (month = 0), for the palette
  topMerchants: MerchantStat[] // over complete months
}

const sumBy = <T>(items: T[], value: (item: T) => number) =>
  items.reduce((s, item) => s + value(item), 0)
const rate = (net: number, income: number) => (income > 0 ? net / income : null)

export function computeAllTimeStats(data: StatsData, today: Date): AllTimeStats {
  const todayKey = isoDate(today)
  const { coverage, statusOf } = monthStatusResolver(data.transactions, data.imports, todayKey)
  const index = buildGroupIndex(data.categories, data.typeMap, data.bills, data.incomes)
  const flows = classifyTransactions(data.transactions, index)

  const flowsByMonth = new Map<string, ClassifiedTx[]>()
  let first: string | null = null
  for (const f of flows) {
    const ym = f.date.slice(0, 7)
    if (!first || ym < first) first = ym
    const list = flowsByMonth.get(ym)
    if (list) list.push(f)
    else flowsByMonth.set(ym, [f])
  }

  const months: MonthStat[] = []
  if (first) {
    let y = Number(first.slice(0, 4))
    let m = Number(first.slice(5, 7))
    const endY = today.getFullYear()
    const endM = today.getMonth() + 1
    let running = 0
    while (y < endY || (y === endY && m <= endM)) {
      const mf = flowsByMonth.get(ymKey(y, m)) ?? []
      const income = sumBy(mf, (f) => f.income)
      const spent = sumBy(mf, (f) => f.spent)
      const status = statusOf(y, m)
      if (status !== "no-data" && status !== "future") running += income - spent
      months.push({
        year: y,
        month: m,
        income,
        spent,
        net: income - spent,
        savingsRate: rate(income - spent, income),
        cumulativeNet: running,
        saved: sumBy(mf, (f) => f.saved),
        towardsGoals: 0,
        transfersOut: sumBy(mf, (f) => f.transferOut),
        transfersIn: sumBy(mf, (f) => f.transferIn),
        budgetIncome: 0,
        budgetBills: 0,
        budgetSavings: 0,
        txCount: mf.filter((f) => f.counted).length,
        status,
      })
      m++
      if (m > 12) {
        m = 1
        y++
      }
    }
  }

  const complete = months.filter((m) => m.status === "complete")
  const summary = summarize(complete, complete)
  const withData = (m: MonthStat) => m.status !== "no-data" && m.status !== "future"

  const years: YearStat[] = []
  for (const y of [...new Set(months.map((m) => m.year))]) {
    const ym = months.filter((m) => m.year === y && withData(m))
    if (ym.length === 0) continue
    const yc = ym.filter((m) => m.status === "complete")
    const income = sumBy(ym, (m) => m.income)
    const spent = sumBy(ym, (m) => m.spent)
    const cIncome = sumBy(yc, (m) => m.income)
    const cSpent = sumBy(yc, (m) => m.spent)
    years.push({
      year: y,
      monthsComplete: yc.length,
      monthsWithData: ym.length,
      income,
      spent,
      net: income - spent,
      saved: sumBy(ym, (m) => m.saved),
      savingsRate: rate(income - spent, income),
      avgMonthlyIncome: yc.length ? cIncome / yc.length : null,
      avgMonthlySpent: yc.length ? cSpent / yc.length : null,
      avgMonthlyNet: yc.length ? (cIncome - cSpent) / yc.length : null,
    })
  }

  // Trailing average over the last 12 complete months (gaps are skipped, not zeroed).
  const rolling: RollingPoint[] = []
  const window: MonthStat[] = []
  for (const m of months) {
    if (m.status === "complete") {
      window.push(m)
      if (window.length > ROLLING_MONTHS) window.shift()
    }
    const full = window.length === ROLLING_MONTHS
    rolling.push({
      year: m.year,
      month: m.month,
      income: full ? sumBy(window, (w) => w.income) / ROLLING_MONTHS : null,
      spent: full ? sumBy(window, (w) => w.spent) / ROLLING_MONTHS : null,
    })
  }

  const completeFlows = complete.flatMap((m) => flowsByMonth.get(ymKey(m.year, m.month)) ?? [])
  const spentFlows = completeFlows.filter((f) => f.spent !== 0)
  const categories = categorySlices(
    spentFlows,
    spentFlows,
    complete.length,
    summary.spent,
    new Map(),
    index,
  )

  const yearTotals = new Map<string | null, number>()
  const historyRows = years.map((y) => {
    const values: Record<string, number> = {}
    for (const m of complete.filter((c) => c.year === y.year)) {
      for (const f of flowsByMonth.get(ymKey(m.year, m.month)) ?? []) {
        if (f.spent === 0) continue
        const key = f.groupId ?? NONE_KEY
        values[key] = (values[key] ?? 0) + f.spent
        yearTotals.set(f.groupId, (yearTotals.get(f.groupId) ?? 0) + f.spent)
      }
    }
    return { year: y.year, month: 0, values }
  })
  const categoryHistory: CategoryHistory = {
    categories: [...yearTotals.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([id]) => ({ id, name: index.nameOf(id) })),
    months: historyRows,
  }

  const merchants = new Map<string, MerchantStat>()
  for (const f of spentFlows) {
    const stat = merchants.get(f.merchant) ?? { name: f.merchant, amount: 0, txCount: 0 }
    stat.amount += f.spent
    stat.txCount++
    merchants.set(f.merchant, stat)
  }

  return {
    hasData: months.some((m) => m.txCount > 0),
    dataFrom: coverage.start,
    dataThrough: coverage.through,
    months,
    years,
    summary,
    deficitMonths: complete.filter((m) => m.spent > m.income).length,
    surplusMonths: complete.filter((m) => m.spent <= m.income).length,
    rolling,
    categories,
    categoryHistory,
    topMerchants: [...merchants.values()]
      .filter((m) => m.amount > 0)
      .sort((a, b) => b.amount - a.amount)
      .slice(0, TOP_MERCHANTS),
  }
}
