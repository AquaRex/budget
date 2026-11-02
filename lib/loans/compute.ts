import type { Loan } from "@/lib/data/loans"
import type { Category, Transaction } from "@/lib/types"
import {
  effectiveCategoryId,
  effectiveDate,
  type TypeMap,
} from "@/lib/spending"
import { monthIndexOf, yearOf } from "@/lib/savings/compute"

// A loan month by month, anchored on what was owed at the start month:
//   interest  balance × yearly rate / 12, added each month
//   payment   money out in the loan's category (or any category in its group)
//             that month, net of money back; covers the interest first, the
//             rest pays the balance down
// Months before the start month are worked backwards from its amount, back to
// the first payment. Past months use your actual payments (this month once
// something is paid); later months repeat the planned payment, or the average
// of the latest payments, until the balance is gone.

const AVERAGE_OF = 3
const MAX_MONTHS = 50 * 12

export type LoanMonth = {
  monthIndex: number
  balance: number // after this month's interest and payment
  interest: number
  principal: number
  projected: boolean
}

export type LoanYear = {
  year: number
  interest: number
  principal: number
  projected: boolean // any month that year is projected
}

export type LoanProjection = {
  balanceNow: number
  firstIndex: number // first month shown: the earliest payment, or the start month
  firstBalance: number // owed at the start of firstIndex (worked back from the amount entered)
  paidSoFar: number
  interestSoFar: number
  principalSoFar: number
  payment: number // per month going forward
  paymentFromPlan: boolean // the loan's planned payment, not the average
  payoff: number | null // month index the balance reaches 0; null = never within 50 years
  interestLeft: number
  months: LoanMonth[]
  years: LoanYear[]
}

/**
 * Payments per month index: money out in the loan's category or its group,
 * every month — those before the start month are worked backwards.
 */
export function loanPayments(
  loan: Loan,
  transactions: Transaction[],
  categories: Category[],
  typeMap: TypeMap,
): Map<number, number> {
  const groupOf = new Map(categories.map((c) => [c.id, c.group_id]))
  const out = new Map<number, number>()
  if (!loan.category_id) {
    return out
  }
  for (const t of transactions) {
    if (t.is_excluded) {
      continue
    }
    const cat = effectiveCategoryId(t, typeMap)
    if (
      !cat ||
      (cat !== loan.category_id && groupOf.get(cat) !== loan.category_id)
    ) {
      continue
    }
    const date = effectiveDate(t)
    const i = monthIndexOf(Number(date.slice(0, 4)), Number(date.slice(5, 7)))
    out.set(i, (out.get(i) ?? 0) - Number(t.amount))
  }
  return out
}

export function projectLoan(
  loan: Loan,
  payments: Map<number, number>,
  todayIndex: number,
): LoanProjection {
  const rate = loan.interest_pct / 100 / 12
  const start = monthIndexOf(loan.start_year, loan.start_month)
  const months: LoanMonth[] = []
  let paidSoFar = 0
  let interestSoFar = 0

  // Before the start month, undo each payment from the amount entered:
  // owed before a month = (owed after + paid) / (1 + rate).
  const first = loan.include_history
    ? Math.min(start, ...payments.keys())
    : start
  let balance = loan.balance
  for (let i = start - 1; i >= first; i--) {
    const paid = payments.get(i) ?? 0
    const after = balance
    balance = (after + paid) / (1 + rate)
    const interest = balance * rate
    paidSoFar += paid
    interestSoFar += interest
    months.unshift({
      monthIndex: i,
      balance: after,
      interest,
      principal: paid - interest,
      projected: false,
    })
  }
  const firstBalance = balance
  balance = loan.balance

  // This month only once something is paid; until then it's projected.
  const lastActual = payments.has(todayIndex) ? todayIndex : todayIndex - 1
  for (let i = start; i <= lastActual && balance > 0; i++) {
    const interest = balance * rate
    const paid = payments.get(i) ?? 0
    const principal = Math.min(paid - interest, balance)
    balance -= principal
    paidSoFar += paid
    interestSoFar += interest
    months.push({
      monthIndex: i,
      balance,
      interest,
      principal,
      projected: false,
    })
  }

  const recent = [...payments.entries()]
    .filter(([i, paid]) => i <= todayIndex && paid > 0)
    .sort((a, b) => b[0] - a[0])
    .slice(0, AVERAGE_OF)
  const average = recent.length
    ? recent.reduce((s, [, paid]) => s + paid, 0) / recent.length
    : 0
  const payment = loan.monthly_payment ?? average

  const balanceNow = balance
  let interestLeft = 0
  let payoff: number | null =
    balance <= 0 ? (months.at(-1)?.monthIndex ?? start) : null
  if (payment > balance * rate) {
    for (let k = 1; k <= MAX_MONTHS && balance > 0; k++) {
      const i = Math.max(lastActual, start - 1) + k
      const interest = balance * rate
      const principal = Math.min(payment - interest, balance)
      balance -= principal
      interestLeft += interest
      months.push({
        monthIndex: i,
        balance,
        interest,
        principal,
        projected: true,
      })
      if (balance <= 0) {
        payoff = i
      }
    }
  }

  const byYear = new Map<number, LoanYear>()
  for (const m of months) {
    const year = yearOf(m.monthIndex)
    const y = byYear.get(year) ?? {
      year,
      interest: 0,
      principal: 0,
      projected: false,
    }
    y.interest += m.interest
    y.principal += m.principal
    y.projected ||= m.projected
    byYear.set(year, y)
  }

  return {
    balanceNow,
    paidSoFar,
    interestSoFar,
    firstIndex: first,
    firstBalance,
    principalSoFar: firstBalance - balanceNow,
    payment,
    paymentFromPlan: loan.monthly_payment !== null,
    payoff: balance <= 0 ? payoff : null,
    interestLeft,
    months,
    years: [...byYear.values()],
  }
}
