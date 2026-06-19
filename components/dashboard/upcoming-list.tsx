"use client"

import { useMemo } from "react"
import { ArrowDownRight, ArrowUpRight } from "lucide-react"

import type { Entry } from "@/lib/types"
import { formatNOK, dayLabel } from "@/lib/format"
import { cn } from "@/lib/utils"
import { effectiveAmount, type BudgetContext } from "@/lib/budget"
import { useCategories } from "@/lib/data/use-budget"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

type Item = {
  id: string
  name: string
  day: number
  amount: number
  kind: "bill" | "income"
  category: string | null
}

export function UpcomingList({
  bills,
  incomes,
  ctx,
  month,
}: {
  bills: Entry[]
  incomes: Entry[]
  ctx: BudgetContext
  month: number
}) {
  const { categories } = useCategories()
  const items = useMemo<Item[]>(() => {
    const nameOf = (id: string | null) =>
      categories.find((c) => c.id === id)?.name ?? null
    const build = (entries: Entry[], kind: "bill" | "income"): Item[] =>
      entries
        .filter((e) => e.is_active)
        .map((e) => ({
          id: e.id,
          name: e.name,
          day: e.due_day,
          amount: effectiveAmount(e, ctx, month),
          kind,
          category: nameOf(e.category_id),
        }))
        .filter((i) => i.amount > 0)
    return [...build(bills, "bill"), ...build(incomes, "income")].sort(
      (a, z) => a.day - z.day,
    )
  }, [bills, incomes, ctx, month, categories])

  return (
    <Card>
      <CardHeader>
        <CardTitle>Month schedule</CardTitle>
        <CardDescription>Ordered by day of the month</CardDescription>
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
                    <p className="text-muted-foreground text-xs">
                      {dayLabel(item.day)}
                      {item.category ? ` · ${item.category}` : ""}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "text-sm font-semibold tabular-nums",
                      isIncome
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-foreground",
                    )}
                  >
                    {isIncome ? "+" : "−"}
                    {formatNOK(item.amount)}
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
