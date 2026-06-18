"use client"

import { useState } from "react"
import {
  ChevronLeft,
  ChevronRight,
  PiggyBank,
  Receipt,
  TrendingUp,
  Wallet,
} from "lucide-react"

import { formatNOK } from "@/lib/format"
import { cn } from "@/lib/utils"
import { MONTHS_LONG, monthTotal, monthlySeries } from "@/lib/budget"
import {
  useEntries,
  useAmounts,
  useSalaryProfile,
  useBudgetContext,
} from "@/lib/data/use-budget"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { Separator } from "@/components/ui/separator"
import { CategoryDonut } from "@/components/dashboard/category-donut"
import { UpcomingList } from "@/components/dashboard/upcoming-list"
import { YearSummary } from "@/components/dashboard/year-summary"
import { BalanceChart } from "@/components/dashboard/balance-chart"

export default function DashboardPage() {
  const [month, setMonth] = useState(new Date().getMonth() + 1) // 1-12

  const { entries: bills, isLoading: lb } = useEntries("bill")
  const { entries: incomes, isLoading: li } = useEntries("income")
  const { amounts, isLoading: la } = useAmounts()
  const { profile, isLoading: ls } = useSalaryProfile()
  const ctx = useBudgetContext(amounts, profile)
  const loading = lb || li || la || ls

  // Months cycle Jan..Dec (the budget is a single recurring template).
  const stepMonth = (delta: number) =>
    setMonth((m) => ((m - 1 + delta + 12) % 12) + 1)

  const series = monthlySeries(incomes, bills, ctx)
  const totalIncome = monthTotal(incomes, ctx, month)
  const totalBills = monthTotal(bills, ctx, month)
  const remaining = totalIncome - totalBills
  const usedPct =
    totalIncome > 0
      ? Math.min(100, Math.round((totalBills / totalIncome) * 100))
      : 0

  const cards = [
    {
      label: "Income",
      value: totalIncome,
      icon: TrendingUp,
      tone: "text-emerald-600 dark:text-emerald-400",
    },
    {
      label: "Bills",
      value: totalBills,
      icon: Receipt,
      tone: "text-rose-600 dark:text-rose-400",
    },
    {
      label: "Remaining",
      value: remaining,
      icon: Wallet,
      tone:
        remaining >= 0
          ? "text-emerald-600 dark:text-emerald-400"
          : "text-rose-600 dark:text-rose-400",
    },
  ]

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground text-sm">
            {MONTHS_LONG[month - 1]} — your recurring monthly picture.
          </p>
        </div>
        <div className="flex items-center rounded-md border">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Previous month"
            onClick={() => stepMonth(-1)}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <span className="w-28 text-center text-sm font-medium">
            {MONTHS_LONG[month - 1]}
          </span>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Next month"
            onClick={() => stepMonth(1)}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map(({ label, value, icon: Icon, tone }) => (
          <Card key={label}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-muted-foreground text-sm font-medium">
                {label}
              </CardTitle>
              <Icon className={cn("size-4", tone)} />
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-8 w-28" />
              ) : (
                <div className={cn("text-2xl font-semibold tabular-nums", tone)}>
                  {formatNOK(value)}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-muted-foreground text-sm font-medium">
              Income used
            </CardTitle>
            <PiggyBank className="text-muted-foreground size-4" />
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {loading ? (
              <Skeleton className="h-4 w-full" />
            ) : (
              <>
                <div className="flex items-baseline justify-between">
                  <span className="text-2xl font-semibold tabular-nums">
                    {usedPct}%
                  </span>
                  <span className="text-muted-foreground text-sm">
                    {formatNOK(totalBills)} of {formatNOK(totalIncome)}
                  </span>
                </div>
                <Progress value={usedPct} />
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-muted-foreground text-sm font-medium">
              Year trend
            </CardTitle>
          </CardHeader>
          <CardContent>
            <BalanceChart data={series} height={160} compact highlightMonth={month} />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <CategoryDonut bills={bills} ctx={ctx} month={month} />
        <UpcomingList bills={bills} incomes={incomes} ctx={ctx} month={month} />
      </div>

      <Separator className="my-2" />

      <YearSummary bills={bills} incomes={incomes} ctx={ctx} />
    </div>
  )
}
