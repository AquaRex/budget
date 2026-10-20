"use client"

import type { MonthStat, PeriodSummary } from "@/lib/stats/types"
import { cn } from "@/lib/utils"
import { SavingsRing } from "@/components/stats/savings-ring"
import { WealthChart } from "@/components/stats/wealth-chart"
import {
  down,
  kr,
  leftThisMonth,
  pct,
  signedKr,
  up,
} from "@/components/stats/display"

const big = "text-4xl font-semibold tracking-tight"

/** Savings rate ring with what was kept and the usual rate for context. */
export function SavingsKpi({
  summary,
  baselineLabel,
  month,
}: {
  summary: PeriodSummary
  baselineLabel: string
  month?: MonthStat // month scope: the focused month
}) {
  const inProgress = month?.status === "current"
  const left = leftThisMonth(month, summary)
  return (
    <div className="flex items-center gap-4">
      <SavingsRing
        rate={summary.savingsRate}
        size={104}
        inProgress={inProgress}
      />
      <div className="flex min-w-0 flex-col gap-1">
        <span
          className={cn(
            "text-2xl font-semibold tracking-tight whitespace-nowrap",
            inProgress ? "text-foreground" : summary.net >= 0 ? up : down,
          )}
        >
          {signedKr(inProgress ? left.value : summary.net)}
        </span>
        <span className="text-muted-foreground text-xs">
          {inProgress
            ? [left.label, left.note].filter(Boolean).join(" · ")
            : `kept of ${kr(summary.income)} income`}
        </span>
        <span className="text-muted-foreground mt-1 text-xs">
          {baselineLabel}{" "}
          <span className="text-foreground font-medium tabular-nums">
            {pct(summary.avgSavingsRate)}
          </span>
        </span>
      </div>
    </div>
  )
}

/** Income vs spent as two bars on one scale, net underneath. */
export function CashKpi({ summary }: { summary: PeriodSummary }) {
  const max = Math.max(summary.income, summary.spent, 1)
  const rows = [
    {
      label: "Income",
      value: summary.income,
      budget: summary.budgetIncome,
      bar: "bg-(--viz-income)",
    },
    {
      label: "Spent",
      value: summary.spent,
      budget: summary.budgetBills,
      bar: "bg-(--viz-spent)",
    },
  ]
  return (
    <div className="flex flex-col gap-3">
      {rows.map((r) => (
        <div key={r.label} className="flex flex-col gap-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-muted-foreground text-xs font-medium">
              {r.label}
            </span>
            <span className="text-xl font-semibold tabular-nums">
              {kr(r.value)}
            </span>
          </div>
          <div className="bg-muted relative h-2.5">
            <div
              className={cn(
                "absolute inset-y-0 left-0 transition-[width] duration-700 ease-out motion-reduce:transition-none",
                r.bar,
              )}
              style={{ width: `${(Math.max(0, r.value) / max) * 100}%` }}
            />
            {r.budget > 0 && r.budget <= max && (
              <div
                className="bg-foreground absolute -inset-y-0.5 w-0.5"
                style={{ left: `calc(${(r.budget / max) * 100}% - 1px)` }}
                title={`Budget ${kr(r.budget)}`}
              />
            )}
          </div>
          <span className="text-muted-foreground text-[11px] tabular-nums">
            budget {kr(r.budget)}
          </span>
        </div>
      ))}
    </div>
  )
}

/** Year scope: net saved so far with the running wealth line. */
export function NetSavedKpi({
  summary,
  months,
}: {
  summary: PeriodSummary
  months: MonthStat[]
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className={cn(big, summary.net >= 0 ? up : down)}>
        {signedKr(summary.net)}
      </span>
      <span className="text-muted-foreground text-xs">
        avg {signedKr(summary.avgMonthlyIncome - summary.avgMonthlySpent)} /
        month over {summary.monthsCounted} mo
      </span>
      <WealthChart months={months} height={64} sparkline />
    </div>
  )
}

/** Budget-only view for a period without imported bank data. */
export function BudgetKpi({
  income,
  bills,
}: {
  income: number
  bills: number
}) {
  const left = income - bills
  return (
    <dl className="grid grid-cols-3 gap-3">
      <div>
        <dt className="text-muted-foreground text-xs">Budgeted income</dt>
        <dd className={cn("text-xl font-semibold tabular-nums", up)}>
          {kr(income)}
        </dd>
      </div>
      <div>
        <dt className="text-muted-foreground text-xs">Budgeted bills</dt>
        <dd className="text-xl font-semibold tabular-nums">{kr(bills)}</dd>
      </div>
      <div>
        <dt className="text-muted-foreground text-xs">Left</dt>
        <dd
          className={cn(
            "text-xl font-semibold tabular-nums",
            left >= 0 ? up : down,
          )}
        >
          {signedKr(left)}
        </dd>
      </div>
    </dl>
  )
}
