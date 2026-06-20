"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { ChevronLeft, ChevronRight, PiggyBank } from "lucide-react"

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
  effectiveDate,
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
import { MiniMonthCalendar } from "@/components/dashboard/mini-month-calendar"
import { MonthCalendar, type CalEvent } from "@/components/calendar/month-calendar"

export default function DashboardPage() {
  const [month, setMonth] = useState(new Date().getMonth() + 1) // 1-12

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

  const stepMonth = (delta: number) =>
    setMonth((m) => ((m - 1 + delta + 12) % 12) + 1)

  // Left/right arrow keys change the month (unless typing or a dialog is open).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return
      const el = e.target as HTMLElement | null
      if (el && /^(input|textarea|select)$/i.test(el.tagName)) return
      if (document.querySelector('[role="dialog"]')) return
      setMonth((m) => ((m - 1 + (e.key === "ArrowLeft" ? -1 : 1) + 12) % 12) + 1)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

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
  const spend = avgMonthlySpend(transactions)
  const miniYear = period ? Number(period.slice(0, 4)) : new Date().getFullYear()

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
      const p = effectiveDate(t).slice(0, 7)
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
          effectiveDate(t).slice(0, 7) === key &&
          isSpending(t) &&
          groupOfCategory(effectiveCategoryId(t, typeMap), groupIds, catById) ===
            categoryId,
      )
      .map((t) => ({
        day: Number(effectiveDate(t).slice(8, 10)),
        name: t.description || t.type || "—",
        amount: -Number(t.amount),
        kind: "bill",
        merchant: deriveStem(t.description) || t.type || "",
      }))
  }

  // Budget figures (cards always show budget; actuals show alongside).
  const income = budgetIncome
  const outgoing = budgetBills
  const left = income - outgoing
  const usedPct =
    income > 0 ? Math.min(100, Math.round((outgoing / income) * 100)) : 0
  const savePct = income > 0 ? Math.round((left / income) * 100) : 0
  const vsBudget = budgetBills - actualSpent // + = under budget

  // Actual spending split for the donut (resolved categories -> names).
  const actualSlices = useMemo(() => {
    if (!hasActuals) return undefined
    const nameOf = (id: string | null) =>
      categories.find((c) => c.id === id)?.name ?? "Uncategorised"
    return Array.from(actualByCategory(transactions, period, typeMap)).map(
      ([id, amount]) => ({ category: nameOf(id), amount }),
    )
  }, [hasActuals, transactions, period, typeMap, categories])

  // Spending events for the mini-calendar / full month calendar.
  const monthEvents = (yy: number, m: number): CalEvent[] => {
    const key = `${yy}-${String(m).padStart(2, "0")}`
    return transactions
      .filter((t) => effectiveDate(t).slice(0, 7) === key && isSpending(t))
      .map((t) => {
        const ec = effectiveCategoryId(t, typeMap)
        return {
          day: Number(effectiveDate(t).slice(8, 10)),
          name: t.description || t.type || "—",
          category:
            (ec && categories.find((c) => c.id === ec)?.name) ||
            t.type ||
            "Uncategorised",
          amount: -Number(t.amount),
          kind: "bill" as const,
          merchant: deriveStem(t.description) || t.type || "",
        }
      })
  }
  const [monthCalOpen, setMonthCalOpen] = useState(false)

  // Extra actual-spend stats for the selected month.
  const actualIncome = useMemo(
    () => incomeInPeriod(transactions, period),
    [transactions, period],
  )
  const savingsRate =
    income > 0 ? Math.round(((income - outgoing) / income) * 100) : 0
  const monthStats = useMemo(() => {
    const inP = transactions.filter(
      (t) => !!period && effectiveDate(t).slice(0, 7) === period && isSpending(t),
    )
    let biggest = { amount: 0, name: "—" }
    for (const t of inP) {
      const amt = -Number(t.amount)
      if (amt > biggest.amount) {
        const ec = effectiveCategoryId(t, typeMap)
        biggest = {
          amount: amt,
          name: (ec && categories.find((c) => c.id === ec)?.name) || t.type || "—",
        }
      }
    }
    let top = { amount: 0, name: "—" }
    for (const [id, amt] of actualByCategory(transactions, period, typeMap)) {
      if (amt > top.amount)
        top = {
          amount: amt,
          name: (id && categories.find((c) => c.id === id)?.name) || "Uncategorised",
        }
    }
    return {
      count: inP.length,
      avgTx: inP.length ? actualSpent / inP.length : 0,
      biggest,
      top,
    }
  }, [transactions, period, typeMap, categories, actualSpent])

  const up = "text-emerald-600 dark:text-emerald-400"
  const down = "text-rose-600 dark:text-rose-400"

  const tiles: {
    label: string
    value: string
    tone?: string
    hint?: string
    hintTone?: "good" | "bad"
  }[] = [
    { label: "Income", value: formatNOK(budgetIncome), tone: up },
    { label: "Bills", value: formatNOK(budgetBills), tone: down },
    { label: "Projected left", value: formatNOK(left), tone: left >= 0 ? up : down },
    {
      label: "Savings rate",
      value: `${savingsRate}%`,
      tone: savingsRate >= 0 ? up : down,
      hint: "of budgeted income",
    },
    ...(hasActuals
      ? [
          {
            label: "Income received",
            value: formatNOK(actualIncome),
            tone: up,
            hint: `${actualIncome >= budgetIncome ? "+" : ""}${formatNOK(actualIncome - budgetIncome)} vs budget`,
            hintTone: (actualIncome >= budgetIncome ? "good" : "bad") as "good" | "bad",
          },
          {
            label: "Spent this month",
            value: formatNOK(actualSpent),
            hint:
              actualSpent === 0
                ? "no transactions"
                : `${actualSpent > spend.avg ? "+" : ""}${formatNOK(actualSpent - spend.avg)} vs avg`,
            hintTone: (actualSpent > spend.avg ? "bad" : "good") as "good" | "bad",
          },
          {
            label: vsBudget >= 0 ? "Under budget" : "Over budget",
            value: formatNOK(Math.abs(vsBudget)),
            tone: vsBudget >= 0 ? up : down,
            hint: `${formatNOK(actualSpent)} of ${formatNOK(budgetBills)}`,
          },
          {
            label: "Avg spent / month",
            value: formatNOK(spend.avg),
            hint: `over ${spend.months} mo`,
          },
          {
            label: "Transactions",
            value: String(monthStats.count),
            hint: "this month",
          },
          {
            label: "Avg / transaction",
            value: formatNOK(monthStats.avgTx),
          },
          {
            label: "Top category",
            value: formatNOK(monthStats.top.amount),
            tone: down,
            hint: monthStats.top.name,
          },
          {
            label: "Biggest expense",
            value: formatNOK(monthStats.biggest.amount),
            tone: down,
            hint: monthStats.biggest.name,
          },
        ]
      : []),
  ]

  return (
    <div className="flex flex-col gap-6">
      <div className="bg-background/95 supports-backdrop-filter:backdrop-blur sticky top-14 z-10 -mx-4 flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3 sm:-mx-6 sm:px-6">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
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

      <div className="grid gap-4 lg:grid-cols-[1fr_1.7fr]">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {tiles.map((t) => (
            <div key={t.label} className="rounded-lg border p-3">
              <div className="text-muted-foreground text-xs font-medium">
                {t.label}
              </div>
              {loading ? (
                <Skeleton className="mt-1 h-6 w-20" />
              ) : (
                <div
                  className={cn(
                    "mt-0.5 truncate text-xl font-semibold tabular-nums",
                    t.tone,
                  )}
                >
                  {t.value}
                </div>
              )}
              {t.hint && (
                <div
                  className={cn(
                    "mt-0.5 text-[11px]",
                    t.hintTone === "good"
                      ? "text-emerald-600 dark:text-emerald-400"
                      : t.hintTone === "bad"
                        ? "text-rose-600 dark:text-rose-400"
                        : "text-muted-foreground",
                  )}
                >
                  {t.hint}
                </div>
              )}
            </div>
          ))}
        </div>

        <Card className="gap-1 py-3">
          <CardHeader className="px-3 pb-0">
            <CardTitle className="text-muted-foreground text-xs font-medium">
              {MONTHS_LONG[month - 1]} {miniYear}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-2 pb-1">
            {hasActuals ? (
              <MiniMonthCalendar
                year={miniYear}
                month={month}
                events={monthEvents(miniYear, month)}
                onOpen={() => setMonthCalOpen(true)}
              />
            ) : (
              <div className="text-muted-foreground py-6 text-center text-xs">
                Import transactions to see daily spending.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

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
              hasActuals
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

      {monthCalOpen && (
        <MonthCalendar
          open
          onOpenChange={setMonthCalOpen}
          initialYear={miniYear}
          initialMonth={month}
          subtitle="Spending"
          getEvents={monthEvents}
          onEventClick={(e, yy, m) => {
            const p = `${yy}-${String(m).padStart(2, "0")}`
            router.push(
              `/spending?tab=transactions&period=${p}&q=${encodeURIComponent(
                e.merchant ?? "",
              )}`,
            )
          }}
        />
      )}
    </div>
  )
}
