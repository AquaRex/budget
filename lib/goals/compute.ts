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
// Projection starts next month; growth on investments isn't assumed.

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

export type RecentMonth = { monthIndex: number; actual: number; budget: number }

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
  overBudget: GroupDiff[] // the top groups over budget
  incomeDiffPerMonth: number // income minus budgeted income this year, per month
  incomeShortPerMonth: number // income below budget this year, per month (0 when at or above)
  diffMonths: number // complete months this year the group and income figures cover
  recent: RecentMonth[] // up to 12 latest complete months with a budget: saved (net) vs budgeted surplus
}

export type GoalInputs = {
  goal: Goal
  holdingsValue: number
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
  const now =
    goal.start_amount + (goal.include_holdings ? input.holdingsValue : 0)
  const target = goal.target_amount
  const deadline = monthIndexOf(goal.target_year, goal.target_month)
  const pattern = new Map(months.map((m) => [m.month, budgetNet(m)]))

  const lookback = [...prevMonths, ...months]
    .filter((m) => m.status === "complete" && m.budgetIncome > 0)
    .slice(-LOOKBACK_MONTHS)
  const gapPerMonth = lookback.length
    ? lookback.reduce((s, m) => s + budgetNet(m) - m.net, 0) / lookback.length
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
    const planned = pattern.get(monthOf(i)) ?? 0
    budget += planned
    actual += planned - gapPerMonth
    if (i <= deadline) {
      budgetSum += planned
    }
    if (reachBudget === null && budget >= target) {
      reachBudget = i
    }
    if (reachActual === null && actual >= target) {
      reachActual = i
    }
    points.push({ monthIndex: i, budget, actual })
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
  const recent = [...prevMonths, ...months]
    .filter((m) => m.status === "complete" && m.budgetIncome > 0)
    .slice(-12)
    .map((m) => ({
      monthIndex: monthIndexOf(m.year, m.month),
      actual: m.net,
      budget: budgetNet(m),
    }))

  return {
    now,
    target,
    deadline,
    monthsLeft,
    needPerMonth: monthsLeft ? Math.max(0, target - now) / monthsLeft : null,
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
    overBudget: groupDiffs.filter((g) => g.perMonth > 0).slice(0, 5),
    incomeDiffPerMonth,
    incomeShortPerMonth: Math.max(0, -incomeDiffPerMonth),
    diffMonths: summary.monthsCounted,
    recent,
  }
}
