"use client"

import { useMemo, useState } from "react"
import {
  ChevronLeft,
  ChevronRight,
  PiggyBank,
  Receipt,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react"

import { formatNOK } from "@/lib/format"
import { cn } from "@/lib/utils"
import { MONTHS_LONG, monthTotal, monthlySeries } from "@/lib/budget"
import {
  avgMonthlySpend,
  latestPeriodByMonth,
  spentInPeriod,
  incomeInPeriod,
  actualByCategory,
  buildTypeMap,
} from "@/lib/spending"
import {
  useEntries,
  useAmounts,
  useSalaryProfile,
  useBudgetContext,
  useCategories,
  useTransactions,
  useTypeCategories,
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

type View = "budget" | "actual"

export default function DashboardPage() {
  const [month, setMonth] = useState(new Date().getMonth() + 1) // 1-12
  const [view, setView] = useState<View>("budget")

  const { entries: bills, isLoading: lb } = useEntries("bill")
  const { entries: incomes, isLoading: li } = useEntries("income")
  const { amounts, isLoading: la } = useAmounts()
  const { profile, isLoading: ls } = useSalaryProfile()
  const { categories } = useCategories()
  const { transactions } = useTransactions()
  const { typeCategories } = useTypeCategories()
  const ctx = useBudgetContext(amounts, profile)
  const loading = lb || li || la || ls

  const typeMap = useMemo(() => buildTypeMap(typeCategories), [typeCategories])
  const hasActuals = transactions.length > 0
  const isActual = view === "actual" && hasActuals

  const stepMonth = (delta: number) =>
    setMonth((m) => ((m - 1 + delta + 12) % 12) + 1)

  const series = monthlySeries(incomes, bills, ctx)
  const budgetIncome = monthTotal(incomes, ctx, month)
  const budgetBills = monthTotal(bills, ctx, month)

  // Actuals for this calendar month use the most recent year that has data.
  const period = useMemo(
    () => latestPeriodByMonth(transactions).get(month),
    [transactions, month],
  )
  const actualSpent = useMemo(
    () => spentInPeriod(transactions, period),
    [transactions, period],
  )
  const actualIncome = useMemo(
    () => incomeInPeriod(transactions, period),
    [transactions, period],
  )
  const spend = avgMonthlySpend(transactions)

  // Values the cards show, depending on the toggle.
  const income = isActual ? actualIncome : budgetIncome
  const outgoing = isActual ? actualSpent : budgetBills
  const left = income - outgoing
  const usedPct =
    income > 0 ? Math.min(100, Math.round((outgoing / income) * 100)) : 0
  const savePct = income > 0 ? Math.round((left / income) * 100) : 0
  const vsBudget = budgetBills - actualSpent // + = under budget

  // Actual category split for the donut (resolved categories -> names).
  const actualSlices = useMemo(() => {
    if (!isActual) return undefined
    const nameOf = (id: string | null) =>
      categories.find((c) => c.id === id)?.name ?? "Uncategorised"
    return Array.from(actualByCategory(transactions, period, typeMap)).map(
      ([id, amount]) => ({ category: nameOf(id), amount }),
    )
  }, [isActual, transactions, period, typeMap, categories])

  const cards = [
    {
      label: isActual ? "Income received" : "Income",
      value: income,
      icon: TrendingUp,
      tone: "text-emerald-600 dark:text-emerald-400",
    },
    {
      label: isActual ? "Spent" : "Bills",
      value: outgoing,
      icon: Receipt,
      tone: "text-rose-600 dark:text-rose-400",
    },
    {
      label: isActual ? "Left after spending" : "Projected left",
      value: left,
      icon: Wallet,
      tone:
        left >= 0
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
            {MONTHS_LONG[month - 1]}
            {isActual && period ? ` ${period.slice(0, 4)}` : ""} —{" "}
            {isActual ? "actual spending vs budget." : "your recurring monthly picture."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {hasActuals && (
            <div className="flex items-center rounded-md border p-0.5">
              {(["budget", "actual"] as View[]).map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={cn(
                    "rounded px-2.5 py-1 text-xs font-medium capitalize transition-colors",
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

      {hasActuals && (
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard
            label="Avg spend / month"
            value={formatNOK(spend.avg)}
            hint={`over ${spend.months} month${spend.months === 1 ? "" : "s"}`}
          />
          <StatCard
            label="Spent this month"
            value={formatNOK(actualSpent)}
            hint={
              actualSpent === 0
                ? "no transactions"
                : `${actualSpent > spend.avg ? "+" : ""}${formatNOK(
                    actualSpent - spend.avg,
                  )} vs average`
            }
            hintTone={actualSpent > spend.avg ? "bad" : "good"}
          />
          <StatCard
            label={vsBudget >= 0 ? "Under budget" : "Over budget"}
            value={formatNOK(Math.abs(vsBudget))}
            hint={`${formatNOK(actualSpent)} of ${formatNOK(budgetBills)} budget`}
            hintTone={vsBudget >= 0 ? "good" : "bad"}
            icon={vsBudget >= 0 ? TrendingDown : TrendingUp}
          />
        </div>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-muted-foreground text-sm font-medium">
            Year trend
          </CardTitle>
        </CardHeader>
        <CardContent>
          <BalanceChart data={series} height={260} highlightMonth={month} />
        </CardContent>
      </Card>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-muted-foreground text-sm font-medium">
                {isActual ? "Income used (actual)" : "Income used"}
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
                      {formatNOK(outgoing)} of {formatNOK(income)}
                    </span>
                  </div>
                  <Progress value={usedPct} />
                  <div className="text-muted-foreground flex justify-between text-xs">
                    <span>
                      Saving{" "}
                      <span
                        className={cn(
                          "font-medium",
                          savePct >= 0
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-rose-600 dark:text-rose-400",
                        )}
                      >
                        {savePct}%
                      </span>{" "}
                      of income
                    </span>
                    <span className="tabular-nums">{formatNOK(left)} left</span>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <CategoryDonut
            bills={bills}
            ctx={ctx}
            month={month}
            slices={actualSlices}
            description={
              isActual
                ? `Actual — ${MONTHS_LONG[month - 1]}${
                    period ? ` ${period.slice(0, 4)}` : ""
                  }`
                : "Active bills this month"
            }
          />
        </div>

        <UpcomingList bills={bills} incomes={incomes} ctx={ctx} month={month} />
      </div>

      <Separator className="my-2" />

      <YearSummary bills={bills} incomes={incomes} ctx={ctx} />
    </div>
  )
}

function StatCard({
  label,
  value,
  hint,
  hintTone,
  icon: Icon,
}: {
  label: string
  value: string
  hint?: string
  hintTone?: "good" | "bad"
  icon?: React.ComponentType<{ className?: string }>
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-muted-foreground text-sm font-medium">
          {label}
        </CardTitle>
        {Icon && <Icon className="text-muted-foreground size-4" />}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold tabular-nums">{value}</div>
        {hint && (
          <p
            className={cn(
              "mt-1 text-xs",
              hintTone === "good"
                ? "text-emerald-600 dark:text-emerald-400"
                : hintTone === "bad"
                  ? "text-rose-600 dark:text-rose-400"
                  : "text-muted-foreground",
            )}
          >
            {hint}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
