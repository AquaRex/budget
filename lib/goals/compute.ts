import type { Goal } from "@/lib/data/goals"
import type { CategorySlice, MonthStat, PeriodSummary } from "@/lib/stats/types"
import { monthIndexOf, monthOf } from "@/lib/savings/compute"

// How a goal is projected:
//   now          what you have today: the goal's start amount (+ the Savings
//                tab's value when include_holdings)
//   on budget    each coming month adds that month's budgeted income minus
//                budgeted bills — this year's budget, repeated for later
//                years. Bills into savings groups count towards the goal.
//   actual pace  the same months minus your average shortfall against the
//                budget (income below it, spending above it) over the last
//                complete months that had a budget
//   towards      money out in categories flagged counts_to_goals is still
//   goals        spending, but its average over the same lookback months is
//                added back to every coming month on both paths
//   growth       with include_holdings, each holding's value today grows at its
//                expected yearly return (compounded monthly); new savings don't
// Projection starts next month.

export const LOOKBACK_MONTHS = 6
const MAX_MONTHS = 50 * 12

export type GoalPoint = { monthIndex: number; budget: number; actual: number }

// perMonth: actual minus budget (+ = over budget, − = under)
export type GroupDiff = {
  id: string | null
  name: string
  perMonth: number
  actual: number // spent per month
  budget: number // budgeted per month
}

export type GoalVerdict =
  | "reached"
  | "on-track"
  | "overspending"
  | "budget-short"
  | "past"

export type GoalProjection = {
  now: number
  target: number
  deadline: number // month index of the goal month
  monthsLeft: number // months from next month through the deadline
  needPerMonth: number | null // to hit the target exactly at the deadline
  budgetPerMonth: number // average budgeted surplus over the months left
  actualPerMonth: number
  gapPerMonth: number // average shortfall vs budget (+ = doing worse than budget)
  gapMonths: number // complete months the gap is averaged over
  reachBudget: number | null // month index the target is reached, null = never within 50 years
  reachActual: number | null
  verdict: GoalVerdict
  points: GoalPoint[] // today, then month by month
  groupDiffs: GroupDiff[] // every spending group vs its budget this year, per month, most over first
  incomeDiffPerMonth: number // income minus budgeted income this year, per month
  incomeShortPerMonth: number // income below budget this year, per month (0 when at or above)
  diffMonths: number // complete months this year the group and income figures cover
  growthByDeadline: number // expected growth on holdings by the goal month
  towardsGoalsPerMonth: number // average spent in categories that count towards Goals
}

export type HoldingValue = { value: number; returnPct: number | null }

export type GoalInputs = {
  goal: Goal
  holdings: HoldingValue[] // value today and expected yearly return
  todayIndex: number
  months: MonthStat[] // this year
  prevMonths: MonthStat[] // last year
  categories: CategorySlice[] // this year's spending groups (complete months)
  summary: PeriodSummary // this year (complete months)
}

const budgetNet = (m: MonthStat) => m.budgetIncome - m.budgetBills

export function hasBudget(months: MonthStat[]): boolean {
  return months.some((m) => m.budgetIncome > 0)
}

export function projectGoal(input: GoalInputs): GoalProjection {
  const { goal, todayIndex, months, prevMonths, categories, summary } = input
  const holdings = goal.include_holdings ? input.holdings : []
  const now = goal.start_amount + holdings.reduce((s, h) => s + h.value, 0)
  const growth = (k: number) =>
    holdings.reduce(
      (s, h) => s + h.value * ((1 + (h.returnPct ?? 0) / 100) ** (k / 12) - 1),
      0,
    )
  const target = goal.target_amount
  const deadline = monthIndexOf(goal.target_year, goal.target_month)
  const pattern = new Map(months.map((m) => [m.month, budgetNet(m)]))

  const lookback = [...prevMonths, ...months]
    .filter((m) => m.status === "complete" && m.budgetIncome > 0)
    .slice(-LOOKBACK_MONTHS)
  const gapPerMonth = lookback.length
    ? lookback.reduce((s, m) => s + budgetNet(m) - m.net, 0) / lookback.length
    : 0
  const towardsGoalsPerMonth = lookback.length
    ? lookback.reduce((s, m) => s + m.towardsGoals, 0) / lookback.length
    : 0

  const points: GoalPoint[] = [
    { monthIndex: todayIndex, budget: now, actual: now },
  ]
  let budget = now
  let actual = now
  let reachBudget: number | null = now >= target ? todayIndex : null
  let reachActual: number | null = reachBudget
  let budgetSum = 0
  for (let k = 1; k <= MAX_MONTHS; k++) {
    const i = todayIndex + k
    const planned = (pattern.get(monthOf(i)) ?? 0) + towardsGoalsPerMonth
    budget += planned
    actual += planned - gapPerMonth
    const g = growth(k)
    if (i <= deadline) {
      budgetSum += planned
    }
    if (reachBudget === null && budget + g >= target) {
      reachBudget = i
    }
    if (reachActual === null && actual + g >= target) {
      reachActual = i
    }
    points.push({ monthIndex: i, budget: budget + g, actual: actual + g })
    if (i >= deadline && reachBudget !== null && reachActual !== null) {
      break
    }
  }
  // Chart: through the later of the deadline and both reach dates, plus a little.
  const end =
    Math.max(
      deadline,
      reachBudget ?? deadline + 24,
      reachActual ?? deadline + 24,
    ) + 3
  const shown = points.filter((p) => p.monthIndex <= end)

  const monthsLeft = Math.max(0, deadline - todayIndex)
  const budgetPerMonth = monthsLeft ? budgetSum / monthsLeft : 0
  const growthByDeadline = growth(monthsLeft)
  const counted = Math.max(1, summary.monthsCounted)
  const groupDiffs = summary.monthsCounted
    ? categories
        .map((c) => ({
          id: c.id,
          name: c.name,
          perMonth: (c.amount - c.budget) / counted,
          actual: c.amount / counted,
          budget: c.budget / counted,
        }))
        .filter((c) => Math.abs(c.perMonth) >= 1)
        .sort((a, b) => b.perMonth - a.perMonth)
    : []
  const incomeDiffPerMonth = summary.monthsCounted
    ? (summary.income - summary.budgetIncome) / counted
    : 0

  return {
    now,
    target,
    deadline,
    monthsLeft,
    needPerMonth: monthsLeft
      ? Math.max(0, target - now - growthByDeadline) / monthsLeft
      : null,
    budgetPerMonth,
    actualPerMonth: budgetPerMonth - gapPerMonth,
    gapPerMonth,
    gapMonths: lookback.length,
    reachBudget,
    reachActual,
    verdict:
      now >= target
        ? "reached"
        : monthsLeft === 0
          ? "past"
          : reachActual !== null && reachActual <= deadline
            ? "on-track"
            : reachBudget !== null && reachBudget <= deadline
              ? "overspending"
              : "budget-short",
    points: shown,
    groupDiffs,
    incomeDiffPerMonth,
    incomeShortPerMonth: Math.max(0, -incomeDiffPerMonth),
    diffMonths: summary.monthsCounted,
    growthByDeadline,
    towardsGoalsPerMonth,
  }
}
