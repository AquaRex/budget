import type { Category, Entry, ImportBatch, Label, Transaction } from "@/lib/types"
import { effectiveDate, type TypeMap } from "@/lib/spending"
import { monthTotal, type BudgetContext } from "@/lib/budget"
import type {
  CategoryHistory,
  CategorySlice,
  DashboardStats,
  DashboardStatsInput,
  DayStat,
  MerchantStat,
  MonthStat,
  PeriodSummary,
  SpendingPace,
} from "@/lib/stats/types"
import { computeCoverage, monthStatus, type Coverage } from "@/lib/stats/coverage"
import { buildFlows, buildGroupIndex, type Flow, type GroupIndex } from "@/lib/stats/flows"
import {
  addDays,
  daysInMonth,
  dayKey,
  isoDate,
  shiftMonth,
  ymKey,
  type YearMonth,
} from "@/lib/stats/dates"

export type StatsData = {
  transactions: Transaction[]
  categories: Category[]
  labels: Label[]
  typeMap: TypeMap
  imports: ImportBatch[]
  bills: Entry[] // budget entries for input.year
  incomes: Entry[]
  ctx: BudgetContext // amounts + salary for input.year
}

const PACE_LOOKBACK_MONTHS = 6
const PACE_MIN_VERDICT_DAY = 3
const TOP_MERCHANTS = 8
const NONE_KEY = "none"

const savingsRate = (net: number, income: number) => (income > 0 ? net / income : null)
const sumBy = <T>(items: T[], value: (item: T) => number) =>
  items.reduce((s, item) => s + value(item), 0)

export function computeDashboardStats(
  data: StatsData,
  input: DashboardStatsInput,
  today: Date,
): Omit<DashboardStats, "loading"> {
  const todayKey = isoDate(today)
  const coverage = computeCoverage(data.transactions, data.imports, todayKey)
  const index = buildGroupIndex(data.categories, data.labels, data.typeMap, data.bills, data.incomes)
  const flows = buildFlows(data.transactions, index)

  const rowsByMonth = new Map<string, number>()
  for (const t of data.transactions) {
    const ym = effectiveDate(t).slice(0, 7)
    rowsByMonth.set(ym, (rowsByMonth.get(ym) ?? 0) + 1)
  }
  const flowsByMonth = new Map<string, Flow[]>()
  const dayStats = new Map<string, DayStat>()
  for (const f of flows) {
    const ym = f.date.slice(0, 7)
    const list = flowsByMonth.get(ym)
    if (list) {
      list.push(f)
    } else {
      flowsByMonth.set(ym, [f])
    }
    const day = dayStats.get(f.date) ?? { date: f.date, spent: 0, income: 0, txCount: 0 }
    day.spent += f.spent
    day.income += f.income
    day.txCount++
    dayStats.set(f.date, day)
  }
  const flowsIn = (yms: YearMonth[]) =>
    yms.flatMap((m) => flowsByMonth.get(ymKey(m.year, m.month)) ?? [])

  const statusOf = (year: number, month: number) =>
    monthStatus(year, month, coverage, todayKey, rowsByMonth.get(ymKey(year, month)) ?? 0)

  const monthStat = (year: number, month: number): MonthStat => {
    const monthFlows = flowsByMonth.get(ymKey(year, month)) ?? []
    const income = sumBy(monthFlows, (f) => f.income)
    const spent = sumBy(monthFlows, (f) => f.spent)
    const inBudgetYear = year === input.year
    return {
      year,
      month,
      income,
      spent,
      net: income - spent,
      savingsRate: savingsRate(income - spent, income),
      cumulativeNet: 0,
      // The budget template loaded is input.year's; other years have none here.
      budgetIncome: inBudgetYear ? monthTotal(data.incomes, data.ctx, month) : 0,
      budgetBills: inBudgetYear ? monthTotal(data.bills, data.ctx, month) : 0,
      txCount: monthFlows.length,
      status: statusOf(year, month),
    }
  }

  const months: MonthStat[] = []
  let runningNet = 0
  for (let m = 1; m <= 12; m++) {
    const stat = monthStat(input.year, m)
    runningNet += stat.net
    stat.cumulativeNet = runningNet
    months.push(stat)
  }
  const statFor = (ym: YearMonth) =>
    ym.year === input.year ? months[ym.month - 1] : monthStat(ym.year, ym.month)

  // The most recent complete months before the focused month, across years.
  const lookback: MonthStat[] = []
  const earliestMonth = coverage.start?.slice(0, 7)
  for (let offset = -1; earliestMonth && lookback.length < PACE_LOOKBACK_MONTHS; offset--) {
    const ym = shiftMonth(input.year, input.month, offset)
    if (ymKey(ym.year, ym.month) < earliestMonth) {
      break
    }
    const stat = statFor(ym)
    if (stat.status === "complete") {
      lookback.push(stat)
    }
  }

  // Totals: month scope = the focused month. Year scope = complete months, plus
  // the current/partial ones when includeIncomplete. Averages only ever use
  // complete months so a half-imported month can't drag them down.
  const focused = months[input.month - 1]
  const totalMonths =
    input.scope === "month"
      ? [focused]
      : months.filter(
          (m) =>
            m.status === "complete" ||
            (input.includeIncomplete && (m.status === "current" || m.status === "partial")),
        )
  const avgMonths =
    input.scope === "month" ? lookback : months.filter((m) => m.status === "complete")

  const scopeFlows = flowsIn(totalMonths).filter((f) => f.spent !== 0)
  const avgFlows = flowsIn(avgMonths).filter((f) => f.spent !== 0)
  const summary = summarize(totalMonths, avgMonths)

  const budgetByGroup = new Map<string | null, number>()
  for (const g of index.groups) {
    const groupBills = data.bills.filter((e) => e.category_id === g.id)
    const budget = sumBy(totalMonths, (m) => monthTotal(groupBills, data.ctx, m.month))
    if (budget !== 0) {
      budgetByGroup.set(g.id, budget)
    }
  }

  const days: DayStat[] = []
  for (let m = 1; m <= 12; m++) {
    for (let d = 1; d <= daysInMonth(input.year, m); d++) {
      const date = dayKey(input.year, m, d)
      days.push(dayStats.get(date) ?? { date, spent: 0, income: 0, txCount: 0 })
    }
  }

  return {
    today: todayKey,
    dataThrough: coverage.through,
    dataFrom: coverage.start,
    ...recentSpend(todayKey, coverage, dayStats),
    hasData: months.some((m) => m.txCount > 0),
    months,
    days,
    summary,
    pace: spendingPace(input, focused, lookback, coverage.through, dayStats),
    categories: categorySlices(scopeFlows, avgFlows, avgMonths.length, summary.spent, budgetByGroup, index),
    categoryHistory: categoryHistory(input.year, flowsByMonth, index),
    topMerchants: topMerchants(scopeFlows),
  }
}

/** Spend today and this week (Monday on, any year), only over days the data covers. */
function recentSpend(
  today: string,
  coverage: Coverage,
  dayStats: Map<string, DayStat>,
): { todaySpent: number | null; weekSpent: number | null } {
  const { start, through } = coverage
  if (!start || !through) {
    return { todaySpent: null, weekSpent: null }
  }
  const [y, m, d] = today.split("-").map(Number)
  const monday = addDays(today, -((new Date(y, m - 1, d).getDay() + 6) % 7))
  const end = through < today ? through : today
  const spentOn = (date: string) => dayStats.get(date)?.spent ?? 0
  let weekSpent: number | null = null
  if (end >= monday && start <= end) {
    weekSpent = 0
    for (let date = monday; date <= end; date = addDays(date, 1)) {
      weekSpent += spentOn(date)
    }
  }
  const todayCovered = start <= today && through >= today
  return { todaySpent: todayCovered ? spentOn(today) : null, weekSpent }
}

function summarize(totalMonths: MonthStat[], avgMonths: MonthStat[]): PeriodSummary {
  const income = sumBy(totalMonths, (m) => m.income)
  const spent = sumBy(totalMonths, (m) => m.spent)
  const avgIncome = sumBy(avgMonths, (m) => m.income)
  const avgSpent = sumBy(avgMonths, (m) => m.spent)
  const n = avgMonths.length
  const rated = avgMonths.filter((m) => m.savingsRate !== null)
  const byRate = (pick: (a: MonthStat, b: MonthStat) => boolean) =>
    rated.reduce<MonthStat | null>((best, m) => (best && !pick(m, best) ? best : m), null)
  return {
    income,
    spent,
    net: income - spent,
    savingsRate: savingsRate(income - spent, income),
    budgetIncome: sumBy(totalMonths, (m) => m.budgetIncome),
    budgetBills: sumBy(totalMonths, (m) => m.budgetBills),
    monthsCounted: n,
    avgMonthlyIncome: n ? avgIncome / n : 0,
    avgMonthlySpent: n ? avgSpent / n : 0,
    // Income-weighted (Σnet / Σincome), never a mean of monthly percentages.
    avgSavingsRate: savingsRate(avgIncome - avgSpent, avgIncome),
    bestMonth: byRate((a, b) => a.savingsRate! > b.savingsRate!),
    worstMonth: byRate((a, b) => a.savingsRate! < b.savingsRate!),
  }
}

/**
 * Cumulative spend is compared day-for-day with the lookback months, and the
 * projection adds their typical *remaining* spend rather than extrapolating
 * linearly, because big fixed bills (rent) land early in the month.
 */
function spendingPace(
  input: DashboardStatsInput,
  focused: MonthStat,
  lookback: MonthStat[],
  dataThrough: string | null,
  dayStats: Map<string, DayStat>,
): SpendingPace {
  const cumulative = (year: number, month: number) => {
    const out = [0]
    for (let d = 1; d <= daysInMonth(year, month); d++) {
      out.push(out[d - 1] + (dayStats.get(dayKey(year, month, d))?.spent ?? 0))
    }
    return out
  }
  const { year, month } = input
  const dim = daysInMonth(year, month)
  const current = cumulative(year, month)
  const lookbackCurves = lookback.map((m) => cumulative(m.year, m.month))
  const averageAt = (day: number) =>
    lookbackCurves.length
      ? sumBy(lookbackCurves, (c) => c[Math.min(day, c.length - 1)]) / lookbackCurves.length
      : 0

  // Days of the focused month the data covers; 0 when it has no data yet.
  let dayOfMonth = 0
  const hasData = focused.status !== "no-data" && focused.status !== "future"
  if (dataThrough && hasData) {
    const focusKey = ymKey(year, month)
    if (dataThrough.slice(0, 7) === focusKey) {
      dayOfMonth = Number(dataThrough.slice(8, 10))
    } else if (dataThrough.slice(0, 7) > focusKey) {
      dayOfMonth = dim
    }
  }

  const spentToDate = current[dayOfMonth]
  const avgToDate = dayOfMonth ? averageAt(dayOfMonth) : 0
  const avgFullMonth = lookbackCurves.length
    ? sumBy(lookbackCurves, (c) => c[c.length - 1]) / lookbackCurves.length
    : 0
  const projected =
    dayOfMonth >= dim ? spentToDate : spentToDate + (avgFullMonth - avgToDate)
  const deltaToDate = spentToDate - avgToDate

  return {
    year,
    month,
    dayOfMonth,
    daysInMonth: dim,
    spentToDate,
    avgToDate,
    avgFullMonth,
    projected,
    deltaToDate,
    // In the first days one bill booking a day later than usual reads as ±100 %.
    deltaPct: avgToDate && dayOfMonth >= PACE_MIN_VERDICT_DAY ? deltaToDate / avgToDate : null,
    lookbackMonths: lookbackCurves.length,
    curve: Array.from({ length: dim }, (_, i) => ({
      day: i + 1,
      current: i + 1 <= dayOfMonth ? current[i + 1] : null,
      average: averageAt(i + 1),
    })),
  }
}

function categorySlices(
  scopeFlows: Flow[],
  avgFlows: Flow[],
  avgMonthCount: number,
  totalSpent: number,
  budgetByGroup: Map<string | null, number>,
  index: GroupIndex,
): CategorySlice[] {
  const slices = new Map<string | null, CategorySlice>()
  const sliceFor = (id: string | null) => {
    let slice = slices.get(id)
    if (!slice) {
      const budget = budgetByGroup.get(id) ?? 0
      slice = { id, name: index.nameOf(id), amount: 0, share: 0, baseline: 0, budget, txCount: 0 }
      slices.set(id, slice)
    }
    return slice
  }
  for (const id of budgetByGroup.keys()) {
    sliceFor(id)
  }
  for (const f of scopeFlows) {
    const slice = sliceFor(f.groupId)
    slice.amount += f.spent
    slice.txCount++
  }
  if (avgMonthCount > 0) {
    for (const f of avgFlows) {
      sliceFor(f.groupId).baseline += f.spent / avgMonthCount
    }
  }
  return Array.from(slices.values())
    .map((s) => ({ ...s, share: totalSpent > 0 ? s.amount / totalSpent : 0 }))
    .sort((a, b) => b.amount - a.amount || b.baseline - a.baseline || b.budget - a.budget)
}

function categoryHistory(
  year: number,
  flowsByMonth: Map<string, Flow[]>,
  index: GroupIndex,
): CategoryHistory {
  const yearTotals = new Map<string | null, number>()
  const months = Array.from({ length: 12 }, (_, i) => {
    const values: Record<string, number> = {}
    for (const f of flowsByMonth.get(ymKey(year, i + 1)) ?? []) {
      if (f.spent === 0) {
        continue
      }
      const key = f.groupId ?? NONE_KEY
      values[key] = (values[key] ?? 0) + f.spent
      yearTotals.set(f.groupId, (yearTotals.get(f.groupId) ?? 0) + f.spent)
    }
    return { year, month: i + 1, values }
  })
  const categories = Array.from(yearTotals.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => ({ id, name: index.nameOf(id) }))
  for (const m of months) {
    for (const c of categories) {
      m.values[c.id ?? NONE_KEY] ??= 0
    }
  }
  return { categories, months }
}

function topMerchants(scopeFlows: Flow[]): MerchantStat[] {
  const merchants = new Map<string, MerchantStat>()
  for (const f of scopeFlows) {
    const stat = merchants.get(f.merchant) ?? { name: f.merchant, amount: 0, txCount: 0 }
    stat.amount += f.spent
    stat.txCount++
    merchants.set(f.merchant, stat)
  }
  return Array.from(merchants.values())
    .filter((m) => m.amount > 0)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, TOP_MERCHANTS)
}
