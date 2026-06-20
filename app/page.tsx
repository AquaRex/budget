"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
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
import {
  MONTHS_LONG,
  MONTHS_SHORT,
  monthTotal,
  monthlySeries,
  monthlySubtotals,
} from "@/lib/budget"
import {
  avgMonthlySpend,
  latestPeriodByMonth,
  spentInPeriod,
  incomeInPeriod,
  actualByCategory,
  effectiveCategoryId,
  groupOfCategory,
  deriveStem,
  isSpending,
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
import { CategoryBudgetChart } from "@/components/dashboard/category-budget-chart"
import { CategoryTrend, type CatTrend } from "@/components/dashboard/category-trend"
import { MonthCalendar, type CalEvent } from "@/components/calendar/month-calendar"

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

  // Budgeted vs spent, per budget category (group), across the whole year.
  // Spend for each calendar month uses that month's most recent period.
  const categoryTrends = useMemo<CatTrend[]>(() => {
    const groupIds = new Set<string>()
    for (const b of bills) if (b.category_id) groupIds.add(b.category_id)
    if (groupIds.size === 0) return []
    const catById = new Map(categories.map((c) => [c.id, c]))
    const periodByMonth = latestPeriodByMonth(transactions)

    const spentByGroup = new Map<string, number[]>()
    for (const t of transactions) {
      if (!isSpending(t)) continue
      const g = groupOfCategory(effectiveCategoryId(t, typeMap), groupIds, catById)
      if (!g) continue
      const p = t.booked_date.slice(0, 7)
      const mo = Number(p.slice(5, 7))
      if (periodByMonth.get(mo) !== p) continue
      const arr = spentByGroup.get(g) ?? Array(12).fill(0)
      arr[mo - 1] += -Number(t.amount)
      spentByGroup.set(g, arr)
    }

    const out: CatTrend[] = []
    for (const id of groupIds) {
      const cat = catById.get(id)
      if (!cat) continue
      const budgeted = monthlySubtotals(
        bills.filter((b) => b.category_id === id),
        ctx,
      )
      const spent = spentByGroup.get(id) ?? Array(12).fill(0)
      const totalBudget = budgeted.reduce((s, v) => s + v, 0)
      const totalSpent = spent.reduce((s, v) => s + v, 0)
      if (totalBudget === 0 && totalSpent === 0) continue
      out.push({
        id,
        name: cat.name,
        totalBudget: Math.round(totalBudget),
        totalSpent: Math.round(totalSpent),
        points: MONTHS_SHORT.map((mLabel, i) => ({
          month: mLabel,
          budgeted: Math.round(budgeted[i]),
          spent: Math.round(spent[i]),
        })),
      })
    }
    return out.sort(
      (a, b) => b.totalSpent + b.totalBudget - (a.totalSpent + a.totalBudget),
    )
  }, [bills, ctx, transactions, typeMap, categories])

  // The bar chart is the selected month sliced out of the same trend data.
  const categoryCompare = useMemo(
    () =>
      categoryTrends
        .map((t) => ({
          category: t.name,
          budget: t.points[month - 1].budgeted,
          spent: t.points[month - 1].spent,
        }))
        .filter((r) => r.budget > 0 || r.spent > 0)
        .sort((a, b) => b.spent + b.budget - (a.spent + a.budget))
        .slice(0, 8),
    [categoryTrends, month],
  )

  // Click a month on the category trend -> calendar of that category that month.
  const router = useRouter()
  const [catCal, setCatCal] = useState<{
    categoryId: string
    month: number
    year: number
  } | null>(null)
  const openCategoryCalendar = (categoryId: string, monthIndex: number) => {
    const mo = monthIndex + 1
    const p = latestPeriodByMonth(transactions).get(mo)
    setCatCal({
      categoryId,
      month: mo,
      year: p ? Number(p.slice(0, 4)) : new Date().getFullYear(),
    })
  }
  const categoryCalEvents = (
    yy: number,
    m: number,
    categoryId: string,
  ): CalEvent[] => {
    const groupIds = new Set<string>()
    for (const b of bills) if (b.category_id) groupIds.add(b.category_id)
    const catById = new Map(categories.map((c) => [c.id, c]))
    const key = `${yy}-${String(m).padStart(2, "0")}`
    return transactions
      .filter(
        (t) =>
          t.booked_date.slice(0, 7) === key &&
          isSpending(t) &&
          groupOfCategory(effectiveCategoryId(t, typeMap), groupIds, catById) ===
            categoryId,
      )
      .map((t) => ({
        day: Number(t.booked_date.slice(8, 10)),
        name: t.description || t.type || "—",
        amount: -Number(t.amount),
        kind: "bill",
        merchant: deriveStem(t.description) || t.type || "",
      }))
  }

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
      <div className="bg-background/95 supports-backdrop-filter:backdrop-blur sticky top-14 z-10 -mx-4 flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3 sm:-mx-6 sm:px-6">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <div className="flex items-center gap-2">
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

      {categoryTrends.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-muted-foreground text-sm font-medium">
              Budgeted vs spent — by category
            </CardTitle>
          </CardHeader>
          <CardContent>
            <CategoryTrend
              trends={categoryTrends}
              onMonthClick={openCategoryCalendar}
            />
          </CardContent>
        </Card>
      )}

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

          {categoryCompare.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-muted-foreground text-sm font-medium">
                  Budgeted vs spent — {MONTHS_LONG[month - 1]}
                  {period ? ` ${period.slice(0, 4)}` : ""}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <CategoryBudgetChart data={categoryCompare} />
              </CardContent>
            </Card>
          )}

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

      {catCal && (
        <MonthCalendar
          open
          onOpenChange={(o) => !o && setCatCal(null)}
          initialYear={catCal.year}
          initialMonth={catCal.month}
          subtitle={categories.find((c) => c.id === catCal.categoryId)?.name}
          getEvents={(yy, m) => categoryCalEvents(yy, m, catCal.categoryId)}
          onEventClick={(e, yy, m) => {
            const period = `${yy}-${String(m).padStart(2, "0")}`
            router.push(
              `/spending?tab=transactions&period=${period}&q=${encodeURIComponent(
                e.merchant ?? "",
              )}`,
            )
          }}
        />
      )}
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
