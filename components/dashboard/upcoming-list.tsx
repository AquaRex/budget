"use client"

import { useMemo, useState } from "react"
import { ArrowDownRight, ArrowUpRight } from "lucide-react"

import type { Entry } from "@/lib/types"
import { formatNOK } from "@/lib/format"
import { cn } from "@/lib/utils"
import { effectiveAmount, type BudgetContext } from "@/lib/budget"
import { useCategories } from "@/lib/data/use-budget"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

type GroupActual = { spent: number; income: number }
type View = "budget" | "actual"

type Item = {
  id: string
  name: string
  day: number
  budget: number
  actual: number
  kind: "bill" | "income"
  category: string | null
}

export function UpcomingList({
  bills,
  incomes,
  ctx,
  month,
  actualByGroup,
}: {
  bills: Entry[]
  incomes: Entry[]
  ctx: BudgetContext
  month: number
  /** Actual totals this month, keyed by the entry's category (group) id. */
  actualByGroup?: Map<string, GroupActual>
}) {
  const { categories } = useCategories()
  const [view, setView] = useState<View>("budget")
  const hasActuals = !!actualByGroup && actualByGroup.size > 0

  const items = useMemo<Item[]>(() => {
    const nameOf = (id: string | null) =>
      categories.find((c) => c.id === id)?.name ?? null
    const build = (entries: Entry[], kind: "bill" | "income"): Item[] =>
      entries
        .filter((e) => e.is_active)
        .map((e) => {
          const a = e.category_id ? actualByGroup?.get(e.category_id) : undefined
          return {
            id: e.id,
            name: e.name,
            day: e.due_day,
            budget: effectiveAmount(e, ctx, month),
            actual: a ? (kind === "income" ? a.income : a.spent) : 0,
            kind,
            category: nameOf(e.category_id),
          }
        })
        .filter((i) => i.budget > 0)
    return [...build(bills, "bill"), ...build(incomes, "income")].sort(
      (a, z) => a.day - z.day,
    )
  }, [bills, incomes, ctx, month, categories, actualByGroup])

  const showActual = view === "actual" && hasActuals

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Month schedule</CardTitle>
        {hasActuals && (
          <div className="flex items-center rounded-md border p-0.5">
            {(["budget", "actual"] as View[]).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={cn(
                  "rounded-sm px-2.5 py-1 text-xs font-medium capitalize transition-colors",
                  view === v
                    ? "bg-secondary text-secondary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {v}
              </button>
            ))}
          </div>
        )}
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <div className="text-muted-foreground py-10 text-center text-sm">
            Nothing scheduled this month.
          </div>
        ) : (
          <ul className="flex flex-col">
            {items.map((item, idx) => {
              const isIncome = item.kind === "income"
              const amount = showActual ? item.actual : item.budget
              return (
                <li
                  key={item.id}
                  className={cn(
                    "flex items-center gap-3 py-3",
                    idx !== items.length - 1 && "border-b",
                  )}
                >
                  <div className="bg-muted text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-md text-xs leading-none font-semibold">
                    {item.day}
                  </div>
                  <div
                    className={cn(
                      "flex size-7 items-center justify-center rounded-full",
                      isIncome
                        ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                        : "bg-rose-500/10 text-rose-600 dark:text-rose-400",
                    )}
                  >
                    {isIncome ? (
                      <ArrowUpRight className="size-4" />
                    ) : (
                      <ArrowDownRight className="size-4" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{item.name}</p>
                    {item.category && (
                      <p className="text-muted-foreground text-xs">
                        {item.category}
                      </p>
                    )}
                  </div>
                  <span
                    className={cn(
                      "text-sm font-semibold tabular-nums",
                      showActual && amount === 0 && "text-muted-foreground",
                      isIncome
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-foreground",
                    )}
                  >
                    {isIncome ? "+" : "−"}
                    {formatNOK(amount)}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
