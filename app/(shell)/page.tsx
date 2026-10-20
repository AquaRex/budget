"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ChevronLeft, ChevronRight, Smartphone, Upload } from "lucide-react"

import type { Scope } from "@/lib/stats/types"
import { useDashboardStats } from "@/lib/stats/use-dashboard-stats"
import { MONTHS_LONG } from "@/lib/budget"
import { cn } from "@/lib/utils"
import { useYear, setYear } from "@/lib/year"
import {
  useAmounts,
  useBudgetContext,
  useEntries,
  useSalaryProfile,
} from "@/lib/data/use-budget"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { UpcomingList } from "@/components/dashboard/upcoming-list"
import {
  BudgetKpi,
  CashKpi,
  NetSavedKpi,
  SavingsKpi,
} from "@/components/dashboard/hero-kpis"
import { Panel } from "@/components/stats/panel"
import { PaceSummary } from "@/components/stats/pace-summary"
import { PaceChart } from "@/components/stats/pace-chart"
import { CashflowChart } from "@/components/stats/cashflow-chart"
import { WealthChart } from "@/components/stats/wealth-chart"
import { CategoryBreakdown } from "@/components/stats/category-breakdown"
import { CategoryHistoryChart } from "@/components/stats/category-history-chart"
import { TopMerchants } from "@/components/stats/top-merchants"
import {
  HeatLegend,
  MonthHeatmap,
  YearHeatmap,
} from "@/components/stats/spending-heatmap"
import { DaySheet } from "@/components/stats/day-sheet"
import {
  DataThrough,
  MonthFigures,
  YearTable,
} from "@/components/stats/period-numbers"
import { useVizData } from "@/components/stats/use-viz-data"

export default function DashboardPage() {
  const year = useYear()
  const [month, setMonth] = useState(new Date().getMonth() + 1) // 1-12
  const [scope, setScope] = useState<Scope>("month")
  const [includeIncomplete, setIncludeIncomplete] = useState(false)
  const [selectedDay, setSelectedDay] = useState<string | null>(null)

  const stats = useDashboardStats({ year, month, scope, includeIncomplete })
  const { heatMonths, scale, palette } = useVizData(stats)

  const { entries: bills } = useEntries("bill")
  const { entries: incomes } = useEntries("income")
  const { amounts } = useAmounts()
  const { profile } = useSalaryProfile()
  const ctx = useBudgetContext(amounts, profile)

  // Month scope steps months (rolling into adjacent years); year scope steps years.
  const step = (delta: number) => {
    if (scope === "year") {
      setYear(year + delta)
      return
    }
    const next = month + delta
    if (next < 1) {
      setYear(year - 1)
      setMonth(12)
    } else if (next > 12) {
      setYear(year + 1)
      setMonth(1)
    } else {
      setMonth(next)
    }
  }

  // Left/right arrow keys step the period (unless typing or a dialog is open).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") {
        return
      }
      const el = e.target as HTMLElement | null
      if (el && /^(input|textarea|select)$/i.test(el.tagName)) {
        return
      }
      if (document.querySelector('[role="dialog"]')) {
        return
      }
      if (el?.closest('[role="radiogroup"]')) {
        return
      }
      step(e.key === "ArrowLeft" ? -1 : 1)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, year, scope])

  const openMonth = (m: number) => {
    setMonth(m)
    setScope("month")
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const focus = stats.months[month - 1]
  const monthLabel = `${MONTHS_LONG[month - 1]} ${year}`
  const baselineLabel =
    scope === "month"
      ? "Typical recent month"
      : `Avg rate · ${stats.summary.monthsCounted} mo`

  // Before payday the current month's rate is meaningless (e.g. −7 647 %), so
  // the hero leads with pace and shows the rate muted as "so far".
  const monthInProgress = focus?.status === "current"
  const savingsPanel = (
    <Panel
      key="savings"
      title={monthInProgress ? "Savings rate · so far" : "Savings rate"}
      subtitle={
        monthInProgress
          ? "Month in progress"
          : "Share of this month's income left unspent"
      }
    >
      <SavingsKpi
        summary={stats.summary}
        baselineLabel={baselineLabel}
        month={focus}
      />
    </Panel>
  )
  const pacePanel = (
    <Panel
      key="pace"
      title="Spending pace"
      subtitle="Spent so far vs your typical month by the same day"
    >
      {focus && (
        <PaceSummary
          pace={stats.pace}
          status={focus.status}
          dataThrough={stats.dataThrough}
        />
      )}
    </Panel>
  )
  const cashPanel = (
    <Panel key="cash" title="Income vs spent" subtitle="Tick = budget">
      <CashKpi summary={stats.summary} />
    </Panel>
  )

  return (
    <div className="flex flex-col gap-6">
      <div className="bg-background/95 supports-backdrop-filter:backdrop-blur sticky top-14 z-10 -mx-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b px-4 py-3 sm:-mx-6 sm:px-6">
        <div className="flex flex-col">
          <h1 className="text-2xl font-semibold tracking-tight">
            {scope === "month" ? monthLabel : year}
          </h1>
          {!stats.loading && (
            <DataThrough dataThrough={stats.dataThrough} today={stats.today} />
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {scope === "year" && (
            <label className="text-muted-foreground flex min-h-11 cursor-pointer items-center gap-2 text-xs sm:min-h-0">
              <Switch
                checked={includeIncomplete}
                onCheckedChange={setIncludeIncomplete}
              />
              {includeIncomplete
                ? "Including incomplete months"
                : "Completed months only"}
            </label>
          )}
          <div className="flex border" role="radiogroup" aria-label="Scope">
            {(["month", "year"] as Scope[]).map((s) => (
              <button
                key={s}
                role="radio"
                aria-checked={scope === s}
                onClick={() => setScope(s)}
                className={cn(
                  "h-11 px-4 text-xs font-semibold tracking-widest uppercase transition-colors sm:h-9",
                  scope === s
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {s}
              </button>
            ))}
          </div>
          <div className="flex items-center border">
            <Button
              variant="ghost"
              size="icon-sm"
              className="size-11 sm:size-9"
              aria-label={`Previous ${scope}`}
              onClick={() => step(-1)}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <span className="w-24 text-center text-xs font-semibold tracking-widest uppercase">
              {scope === "month" ? MONTHS_LONG[month - 1].slice(0, 3) : year}
            </span>
            <Button
              variant="ghost"
              size="icon-sm"
              className="size-11 sm:size-9"
              aria-label={`Next ${scope}`}
              onClick={() => step(1)}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            className="size-11 sm:size-9"
            asChild
          >
            <Link href="/os" aria-label="Open phone view">
              <Smartphone className="size-4" />
            </Link>
          </Button>
        </div>
      </div>

      {stats.loading ? (
        <DashboardSkeleton />
      ) : !stats.hasData ? (
        <>
          <Card className="items-center gap-3 py-12 text-center">
            <Upload className="text-muted-foreground size-8" />
            <p className="text-lg font-semibold">No bank data for {year}</p>
            <p className="text-muted-foreground max-w-sm text-sm">
              Import a transaction export on the Spending page to see savings
              rate, pace and where your money goes.
            </p>
            <Button asChild>
              <Link href="/spending">Go to Spending</Link>
            </Button>
          </Card>
          <Panel
            title={
              scope === "month" ? `Budget · ${monthLabel}` : `Budget · ${year}`
            }
          >
            <BudgetKpi
              income={
                scope === "month"
                  ? (focus?.budgetIncome ?? 0)
                  : stats.months.reduce((s, m) => s + m.budgetIncome, 0)
              }
              bills={
                scope === "month"
                  ? (focus?.budgetBills ?? 0)
                  : stats.months.reduce((s, m) => s + m.budgetBills, 0)
              }
            />
          </Panel>
          {scope === "month" && (
            <UpcomingList
              bills={bills}
              incomes={incomes}
              ctx={ctx}
              month={month}
            />
          )}
        </>
      ) : scope === "month" ? (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 md:[&>:last-child]:col-span-2 xl:[&>:last-child]:col-span-1">
            {monthInProgress
              ? [pacePanel, cashPanel, savingsPanel]
              : [savingsPanel, pacePanel, cashPanel]}
          </div>

          <div className="grid gap-4 lg:grid-cols-5">
            <Panel
              title="Pace curve"
              subtitle="Cumulative spending through the month"
              className="lg:col-span-3"
            >
              <PaceChart pace={stats.pace} height={340} />
            </Panel>
            <Panel
              title="Daily spending"
              subtitle="Tap a day for its transactions"
              className="lg:col-span-2"
            >
              <div className="flex flex-col gap-3">
                <MonthHeatmap
                  days={heatMonths[month - 1]}
                  scale={scale}
                  today={stats.today}
                  selected={selectedDay}
                  onSelectDay={setSelectedDay}
                />
                <HeatLegend scale={scale} />
              </div>
            </Panel>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel
              title="Where it went"
              subtitle="By category, vs your usual month"
            >
              <CategoryBreakdown
                categories={stats.categories}
                palette={palette}
                compareBaseline
              />
            </Panel>
            <Panel title="Top merchants" subtitle={monthLabel}>
              <TopMerchants merchants={stats.topMerchants} />
            </Panel>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel
              title="Category history"
              subtitle={`Monthly spending by category · ${year}`}
            >
              <CategoryHistoryChart
                history={stats.categoryHistory}
                palette={palette}
                focusMonth={month}
              />
            </Panel>
            <Panel
              title="Income vs spending"
              subtitle={`Per month with savings rate · ${year}`}
            >
              <CashflowChart
                months={stats.months}
                focusMonth={month}
                onMonthClick={setMonth}
              />
            </Panel>
          </div>

          <section className="flex flex-col gap-3">
            <h2 className="text-muted-foreground text-[11px] font-semibold tracking-widest uppercase">
              The numbers · {monthLabel}
            </h2>
            <MonthFigures
              month={focus}
              summary={stats.summary}
              pace={stats.pace}
              coveredDays={
                heatMonths[month - 1].filter((d) => d.covered).length
              }
            />
          </section>

          <UpcomingList
            bills={bills}
            incomes={incomes}
            ctx={ctx}
            month={month}
          />
        </>
      ) : (
        <>
          {stats.summary.monthsCounted === 0 && !includeIncomplete ? (
            <Card className="items-center gap-3 py-12 text-center">
              <p className="text-lg font-semibold">
                No completed months in {year} yet
              </p>
              <p className="text-muted-foreground max-w-sm text-sm">
                Year totals only count fully imported months. Include incomplete
                months to see the year so far.
              </p>
              <Button onClick={() => setIncludeIncomplete(true)}>
                Include incomplete months
              </Button>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Panel
                title="Savings rate"
                subtitle={
                  includeIncomplete
                    ? "Year to date, incl. incomplete months"
                    : "Completed months"
                }
              >
                <SavingsKpi
                  summary={stats.summary}
                  baselineLabel={baselineLabel}
                />
              </Panel>
              <Panel
                title="Net saved"
                subtitle={
                  includeIncomplete
                    ? "Year to date, incl. incomplete months"
                    : "Completed months · line shows every month"
                }
              >
                <NetSavedKpi summary={stats.summary} months={stats.months} />
              </Panel>
              <Panel title="Income vs spent" subtitle="Tick = budget">
                <CashKpi summary={stats.summary} />
              </Panel>
              <Panel
                title={`Pace · ${MONTHS_LONG[month - 1]}`}
                subtitle="vs your typical month"
              >
                <PaceSummary
                  pace={stats.pace}
                  status={focus.status}
                  dataThrough={stats.dataThrough}
                />
              </Panel>
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-5">
            <Panel
              title="Income vs spending"
              subtitle="Per month, with savings rate · tap a month"
              className="lg:col-span-3"
            >
              <CashflowChart
                months={stats.months}
                height={240}
                onMonthClick={openMonth}
              />
            </Panel>
            <Panel
              title="Wealth built"
              subtitle="Cumulative net saved"
              className="lg:col-span-2"
            >
              <WealthChart months={stats.months} height={320} />
            </Panel>
          </div>

          <Panel
            title="Spending calendar"
            subtitle={`Every day of ${year} · tap a day, or a month name to open it`}
          >
            <div className="flex flex-col gap-4">
              <YearHeatmap
                months={heatMonths}
                scale={scale}
                today={stats.today}
                selected={selectedDay}
                onSelectDay={setSelectedDay}
                onSelectMonth={openMonth}
              />
              <HeatLegend scale={scale} />
            </div>
          </Panel>

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Where it went" subtitle={`By category · ${year}`}>
              <CategoryBreakdown
                categories={stats.categories}
                palette={palette}
                compareBaseline={false}
              />
            </Panel>
            <Panel
              title="Category history"
              subtitle="Monthly spending by category"
            >
              <CategoryHistoryChart
                history={stats.categoryHistory}
                palette={palette}
                height={300}
              />
            </Panel>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1fr_2fr]">
            <Panel title="Top merchants" subtitle={String(year)}>
              <TopMerchants merchants={stats.topMerchants} limit={10} />
            </Panel>
            <Panel title="The numbers" subtitle="Tap a month to open it">
              <YearTable
                months={stats.months}
                summary={stats.summary}
                includeIncomplete={includeIncomplete}
                onSelectMonth={openMonth}
              />
            </Panel>
          </div>
        </>
      )}

      <DaySheet
        date={selectedDay}
        day={stats.days.find((d) => d.date === selectedDay)}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedDay(null)
          }
        }}
      />
    </div>
  )
}

function DashboardSkeleton() {
  return (
    <div
      className="flex flex-col gap-4"
      aria-busy="true"
      aria-label="Loading dashboard"
    >
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-44" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-5">
        <Skeleton className="h-80 lg:col-span-3" />
        <Skeleton className="h-80 lg:col-span-2" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-72" />
        <Skeleton className="h-72" />
      </div>
    </div>
  )
}
