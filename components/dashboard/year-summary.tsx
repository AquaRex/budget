"use client"

import { useMemo } from "react"
import { PiggyBank, Receipt, TrendingUp } from "lucide-react"

import type { Entry } from "@/lib/types"
import { formatNOK } from "@/lib/format"
import { cn } from "@/lib/utils"
import { monthlySeries, type BudgetContext } from "@/lib/budget"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { BalanceChart } from "@/components/dashboard/balance-chart"
import { SummaryTable } from "@/components/dashboard/summary-table"

export function YearSummary({
  bills,
  incomes,
  ctx,
}: {
  bills: Entry[]
  incomes: Entry[]
  ctx: BudgetContext
}) {
  const data = useMemo(
    () => monthlySeries(incomes, bills, ctx),
    [incomes, bills, ctx],
  )

  const totalIncome = data.reduce((s, d) => s + d.income, 0)
  const totalBills = data.reduce((s, d) => s + d.expenses, 0)
  const net = totalIncome - totalBills

  const cards = [
    {
      label: "Annual income",
      value: totalIncome,
      icon: TrendingUp,
      tone: "text-emerald-600 dark:text-emerald-400",
    },
    {
      label: "Annual bills",
      value: totalBills,
      icon: Receipt,
      tone: "text-rose-600 dark:text-rose-400",
    },
    {
      label: net >= 0 ? "Projected savings" : "Projected shortfall",
      value: net,
      icon: PiggyBank,
      tone:
        net >= 0
          ? "text-emerald-600 dark:text-emerald-400"
          : "text-rose-600 dark:text-rose-400",
    },
  ]

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-semibold tracking-tight">Annual overview</h2>
        <span className="text-muted-foreground text-sm">Full-year totals</span>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {cards.map(({ label, value, icon: Icon, tone }) => (
          <Card key={label}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-muted-foreground text-sm font-medium">
                {label}
              </CardTitle>
              <Icon className={cn("size-4", tone)} />
            </CardHeader>
            <CardContent>
              <div className={cn("text-2xl font-semibold tabular-nums", tone)}>
                {formatNOK(value)}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">
            Income, expenses &amp; ending balance
          </CardTitle>
        </CardHeader>
        <CardContent>
          <BalanceChart data={data} height={300} />
        </CardContent>
      </Card>

      <SummaryTable data={data} />
    </div>
  )
}
