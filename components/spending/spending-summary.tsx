"use client"

import { useMemo } from "react"

import type { Entry, Transaction } from "@/lib/types"
import { cn } from "@/lib/utils"
import { monthTotal, type BudgetContext } from "@/lib/budget"
import {
  isSpending,
  isIncome,
  effectiveCategoryId,
  type TypeMap,
} from "@/lib/spending"
import { Panel } from "@/components/stats/panel"
import { down, kr, pct, up } from "@/components/stats/display"

/** The period's headline figures. Per-group detail lives on Groups. */
export function SpendingSummary({
  transactions,
  bills,
  ctx,
  months,
  typeMap,
  periodLabel,
  inProgress,
}: {
  transactions: Transaction[]
  bills: Entry[]
  ctx: BudgetContext
  /** Month numbers (1-12) covered by the view; budget is summed over them. */
  months: number[]
  typeMap: TypeMap
  periodLabel: string
  inProgress: boolean
}) {
  const { totalSpent, totalBudget, totalIncome, uncategorised } = useMemo(() => {
    let totalSpent = 0
    let totalIncome = 0
    let uncategorised = 0
    for (const t of transactions) {
      if (isSpending(t)) {
        const v = -Number(t.amount)
        totalSpent += v
        if (!effectiveCategoryId(t, typeMap)) {
          uncategorised += v
        }
      } else if (isIncome(t)) {
        totalIncome += Number(t.amount)
      }
    }
    // Budget is the recurring template; sum it across every month in view.
    const totalBudget = months.reduce((s, m) => s + monthTotal(bills, ctx, m), 0)
    return { totalSpent, totalBudget, totalIncome, uncategorised }
  }, [transactions, bills, ctx, months, typeMap])

  const diff = totalBudget - totalSpent
  const figures = [
    {
      label: "Spent",
      value: kr(totalSpent),
      tone: "",
      hint:
        uncategorised > 0
          ? `${kr(uncategorised)} not categorised`
          : "Everything categorised",
    },
    {
      label: "Budgeted bills",
      value: kr(totalBudget),
      tone: "",
      hint: inProgress
        ? "For the whole period"
        : totalBudget > 0
          ? `${pct(totalSpent / totalBudget)} used`
          : "—",
    },
    inProgress
      ? {
          label: "Budget used",
          value: totalBudget > 0 ? pct(totalSpent / totalBudget) : "—",
          tone: "",
          hint: "Still in progress · verdict when complete",
        }
      : {
          label: diff >= 0 ? "Under budget" : "Over budget",
          value: kr(Math.abs(diff)),
          tone: diff >= 0 ? up : down,
          hint: "Budgeted bills − spent",
        },
    {
      label: "Income received",
      value: kr(totalIncome),
      tone: totalIncome > 0 ? up : "",
      hint: "Money in this period",
    },
  ]

  return (
    <Panel title={periodLabel} subtitle="Savings-group transfers left out">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-4 lg:grid-cols-4">
        {figures.map((f) => (
          <div key={f.label} className="flex min-w-0 flex-col gap-0.5">
            <dt className="text-muted-foreground text-xs font-medium">
              {f.label}
            </dt>
            <dd
              className={cn(
                "truncate text-2xl font-semibold tracking-tight tabular-nums",
                f.tone,
              )}
            >
              {f.value}
            </dd>
            <dd className="text-muted-foreground text-[11px] tabular-nums">
              {f.hint}
            </dd>
          </div>
        ))}
      </dl>
    </Panel>
  )
}
