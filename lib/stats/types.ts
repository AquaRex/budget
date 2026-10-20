// Shared contract between the stats engine (lib/stats) and the dashboard UIs
// (home dashboard + /os). All amounts are positive NOK; "spent" is money out,
// "income" is money in, both excluding internal transfers and excluded rows.

export type Scope = "year" | "month"

// complete = fully covered by imported data; current = the month containing
// today; partial = a past month only partly covered (first/last import edge);
// future = not started; no-data = outside the imported window. Only "complete"
// months feed averages, so gaps never drag them down.
export type MonthStatus = "complete" | "current" | "partial" | "future" | "no-data"

export type MonthStat = {
  year: number
  month: number // 1-12
  income: number
  spent: number
  net: number // income - spent
  savingsRate: number | null // net / income (0..1, may be negative); null when income <= 0
  cumulativeNet: number // running net from Jan of the year (wealth-building proxy)
  budgetIncome: number // from the Budget template
  budgetBills: number
  txCount: number
  status: MonthStatus
}

export type DayStat = {
  date: string // YYYY-MM-DD
  spent: number
  income: number
  txCount: number
}

export type PacePoint = {
  day: number // 1..daysInMonth
  current: number | null // cumulative spent this month; null after today
  average: number // mean cumulative spent of the lookback months by this day
}

export type SpendingPace = {
  year: number
  month: number
  dayOfMonth: number // dataThrough's day when it falls in this month, else daysInMonth
  daysInMonth: number
  spentToDate: number
  avgToDate: number // lookback months' mean cumulative spend through dayOfMonth
  avgFullMonth: number
  projected: number // expected month-end spend at the current pace
  deltaToDate: number // spentToDate - avgToDate (+ = spending faster than usual)
  deltaPct: number | null // deltaToDate / avgToDate; null when avgToDate is 0 or too early in the month for a verdict
  lookbackMonths: number // complete months that fed the average
  curve: PacePoint[]
}

export type CategorySlice = {
  id: string | null // category/group id; null = uncategorised
  name: string
  amount: number
  share: number // 0..1 of the period's total spent
  baseline: number // average monthly amount over the comparison months
  budget: number // budgeted bills for this group over the scope's counted months; 0 when unbudgeted
  txCount: number
}

export type CategoryHistory = {
  categories: { id: string | null; name: string }[]
  // One row per month in the scope; values keyed by category id ("none" for null).
  months: { year: number; month: number; values: Record<string, number> }[]
}

export type MerchantStat = {
  name: string
  amount: number
  txCount: number
}

export type PeriodSummary = {
  income: number
  spent: number
  net: number
  savingsRate: number | null
  budgetIncome: number
  budgetBills: number
  monthsCounted: number // months that fed the averages
  avgMonthlyIncome: number
  avgMonthlySpent: number
  avgSavingsRate: number | null // income-weighted over monthsCounted
  bestMonth: MonthStat | null // highest savings rate among counted months
  worstMonth: MonthStat | null
}

export type DashboardStatsInput = {
  year: number
  month: number // 1-12, the focused month (month scope, and the pace month)
  scope: Scope
  includeIncomplete: boolean // year scope: count the current month in totals/averages
}

export type DashboardStats = {
  loading: boolean
  today: string // YYYY-MM-DD (local)
  dataThrough: string | null // last date the imported data is complete through
  dataFrom: string | null // first date the imported data covers
  todaySpent: number | null // null when today isn't covered by imported data yet
  weekSpent: number | null // Monday..min(today, dataThrough), across year boundaries; null when no day of it is covered
  hasData: boolean
  months: MonthStat[] // always the 12 months of `year`
  days: DayStat[] // every day of `year` (for the calendar heatmap)
  summary: PeriodSummary // for the scope
  pace: SpendingPace // for the focused month
  categories: CategorySlice[] // for the scope, sorted desc
  categoryHistory: CategoryHistory // per month of the year
  topMerchants: MerchantStat[] // for the scope, sorted desc
}
