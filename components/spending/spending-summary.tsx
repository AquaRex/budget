"use client"

import { useMemo } from "react"
import { Receipt, TrendingUp, Wallet } from "lucide-react"

import type { Category, Entry, Transaction } from "@/lib/types"
import { formatNOK } from "@/lib/format"
import { cn } from "@/lib/utils"
import { monthTotal, type BudgetContext } from "@/lib/budget"
import {
  isSpending,
  isInternalTx,
  effectiveCategoryId,
  type TypeMap,
} from "@/lib/spending"
import { categoryColor } from "@/lib/categories"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"

type Row = {
  key: string
  name: string
  budget: number
  actual: number
  /** True for an ungrouped bank type shown as its own bucket. */
  isType?: boolean
}

export function SpendingSummary({
  transactions,
  bills,
  ctx,
  months,
  categories,
  typeMap,
}: {
  transactions: Transaction[]
  bills: Entry[]
  ctx: BudgetContext
  /** Month numbers (1-12) covered by the view; budget is summed over them. */
  months: number[]
  categories: Category[]
  typeMap: TypeMap
}) {
  const { rows, totalSpent, totalBudget, totalIncome } = useMemo(() => {
    const actualByCat = new Map<string, number>() // resolved budget category
    const actualByType = new Map<string, number>() // ungrouped bank types
    let uncategorised = 0
    let totalSpent = 0
    let totalIncome = 0
    for (const t of transactions) {
      if (isSpending(t)) {
        const v = -Number(t.amount)
        totalSpent += v
        const ec = effectiveCategoryId(t, typeMap)
        if (ec) actualByCat.set(ec, (actualByCat.get(ec) ?? 0) + v)
        else if (t.type)
          actualByType.set(t.type, (actualByType.get(t.type) ?? 0) + v)
        else uncategorised += v
      } else if (!isInternalTx(t) && Number(t.amount) > 0) {
        totalIncome += Number(t.amount)
      }
    }

    // Budget is the recurring template; sum it across every month in view.
    const budgetFor = (catId: string) => {
      const filtered = bills.filter((b) => b.category_id === catId)
      return months.reduce((s, m) => s + monthTotal(filtered, ctx, m), 0)
    }

    const rows: Row[] = categories.map((c) => ({
      key: c.id,
      name: c.name,
      budget: budgetFor(c.id),
      actual: actualByCat.get(c.id) ?? 0,
    }))
    for (const [type, actual] of actualByType) {
      rows.push({ key: `type:${type}`, name: type, budget: 0, actual, isType: true })
    }
    if (uncategorised > 0) {
      rows.push({ key: "uncat", name: "Uncategorised", budget: 0, actual: uncategorised })
    }
    rows.sort((a, b) => b.actual - a.actual)

    return {
      rows,
      totalSpent,
      totalIncome,
      totalBudget: months.reduce((s, m) => s + monthTotal(bills, ctx, m), 0),
    }
  }, [transactions, bills, ctx, months, categories, typeMap])

  const diff = totalBudget - totalSpent
  const usedPct =
    totalBudget > 0
      ? Math.min(100, Math.round((totalSpent / totalBudget) * 100))
      : 0

  const cards = [
    {
      label: "Spent",
      value: totalSpent,
      icon: Receipt,
      tone: "text-rose-600 dark:text-rose-400",
    },
    {
      label: "Budgeted",
      value: totalBudget,
      icon: Wallet,
      tone: "text-foreground",
    },
    {
      label: diff >= 0 ? "Under budget" : "Over budget",
      value: Math.abs(diff),
      icon: TrendingUp,
      tone:
        diff >= 0
          ? "text-emerald-600 dark:text-emerald-400"
          : "text-rose-600 dark:text-rose-400",
    },
  ]

  return (
    <div className="flex flex-col gap-4">
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
            Spending vs budget by category
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between text-sm">
              <span className="text-muted-foreground">
                {formatNOK(totalSpent)} of {formatNOK(totalBudget)} budget
              </span>
              <span className="font-medium tabular-nums">{usedPct}%</span>
            </div>
            <Progress value={usedPct} />
            {totalIncome > 0 && (
              <p className="text-muted-foreground text-xs">
                Income received this period: {formatNOK(totalIncome)}
              </p>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="text-muted-foreground border-b text-xs">
                  <th className="py-1.5 pr-2 text-left font-medium">Category</th>
                  <th className="px-2 py-1.5 text-right font-medium">Budget</th>
                  <th className="px-2 py-1.5 text-right font-medium">Actual</th>
                  <th className="py-1.5 pl-2 text-right font-medium">Diff</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={4}
                      className="text-muted-foreground py-6 text-center"
                    >
                      No spending in this period yet.
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => {
                    const d = r.budget - r.actual
                    return (
                      <tr key={r.key} className="border-b last:border-0">
                        <td className="py-1.5 pr-2">
                          <span className="flex items-center gap-2">
                            <span
                              className="size-2.5 rounded-sm"
                              style={{ backgroundColor: categoryColor(r.name) }}
                            />
                            {r.name}
                            {r.isType && (
                              <span className="text-muted-foreground text-[10px]">
                                bank type
                              </span>
                            )}
                          </span>
                        </td>
                        <td className="text-muted-foreground px-2 py-1.5 text-right tabular-nums">
                          {r.budget ? formatNOK(r.budget) : "–"}
                        </td>
                        <td className="px-2 py-1.5 text-right font-medium tabular-nums">
                          {formatNOK(r.actual)}
                        </td>
                        <td
                          className={cn(
                            "py-1.5 pl-2 text-right tabular-nums",
                            d >= 0
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-rose-600 dark:text-rose-400",
                          )}
                        >
                          {r.budget ? formatNOK(d) : "–"}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
