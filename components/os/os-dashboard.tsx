"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useTheme } from "next-themes"
import {
  ChevronLeft,
  ChevronRight,
  LayoutDashboard,
  Moon,
  Sun,
} from "lucide-react"

import { useDashboardStats } from "@/lib/stats/use-dashboard-stats"
import { MONTHS_LONG } from "@/lib/budget"
import { cn } from "@/lib/utils"
import { getYear, setYear, useYear } from "@/lib/year"
import { useCountTransfers } from "@/lib/count-transfers"
import { Skeleton } from "@/components/ui/skeleton"
import { Panel } from "@/components/stats/panel"
import { SavingsRing } from "@/components/stats/savings-ring"
import { PaceSummary } from "@/components/stats/pace-summary"
import { PaceChart } from "@/components/stats/pace-chart"
import { CashflowChart } from "@/components/stats/cashflow-chart"
import { CategoryBreakdown } from "@/components/stats/category-breakdown"
import { TopMerchants } from "@/components/stats/top-merchants"
import { HeatLegend, MonthHeatmap } from "@/components/stats/spending-heatmap"
import { DaySheet } from "@/components/stats/day-sheet"
import {
  DataThrough,
  TransfersCountedChip,
} from "@/components/stats/period-numbers"
import { SetAside } from "@/components/stats/set-aside"
import { useVizData } from "@/components/stats/use-viz-data"
import { BudgetKpi } from "@/components/dashboard/hero-kpis"
import {
  down,
  formatShortDate,
  kr,
  leftThisMonth,
  signedKr,
  up,
} from "@/components/stats/display"

const SWIPE_MIN = 60

/**
 * Phone dashboard. Folded (narrow) = the glance column fills one screen;
 * unfolded (≥600px) = glance + detail side by side.
 */
export function OsDashboard() {
  const year = useYear()
  const [month, setMonth] = useState(() => new Date().getMonth() + 1)
  const [direction, setDirection] = useState<1 | -1>(1)
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const touch = useRef<{ x: number; y: number } | null>(null)
  const { resolvedTheme, setTheme } = useTheme()
  const countTransfers = useCountTransfers()

  // The app opens on today, whatever year the desktop view was left on.
  useEffect(() => {
    const now = new Date().getFullYear()
    if (getYear() !== now) {
      setYear(now)
    }
  }, [])

  const stats = useDashboardStats({
    year,
    month,
    scope: "month",
    includeIncomplete: false,
  })
  const { heatMonths, scale, palette } = useVizData(stats)

  const step = (delta: 1 | -1) => {
    setDirection(delta)
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

  const goToday = () => {
    const now = new Date()
    setYear(now.getFullYear())
    setMonth(now.getMonth() + 1)
  }

  const onTouchStart = (e: React.TouchEvent) => {
    const target = e.target as HTMLElement
    if (target.closest("[data-slot=chart]")) {
      touch.current = null
      return
    }
    touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
  }
  const onTouchEnd = (e: React.TouchEvent) => {
    if (!touch.current) {
      return
    }
    const dx = e.changedTouches[0].clientX - touch.current.x
    const dy = e.changedTouches[0].clientY - touch.current.y
    touch.current = null
    if (Math.abs(dx) > SWIPE_MIN && Math.abs(dx) > Math.abs(dy) * 1.5) {
      step(dx < 0 ? 1 : -1)
    }
  }

  const focus = stats.months[month - 1]
  const isCurrent = focus?.status === "current"
  const monthDays = heatMonths[month - 1]
  const { summary, pace } = stats

  const left = leftThisMonth(focus, summary, stats)
  const biggestDay = monthDays.reduce(
    (best, d) => (d.spent > best.spent ? d : best),
    { date: "", spent: 0 },
  )
  const coveredDays = monthDays.filter((d) => d.covered).length

  // Bank data usually lags a day or two; don't show "0 kr" for days not imported yet.
  const through = stats.dataThrough
  const tiles = isCurrent
    ? [
        {
          label: "Today",
          value: stats.todaySpent == null ? "—" : kr(stats.todaySpent),
          hint: stats.todaySpent == null ? "not imported yet" : null,
        },
        {
          label: "This week",
          value: stats.weekSpent == null ? "—" : kr(stats.weekSpent),
          hint:
            stats.weekSpent == null
              ? "not imported yet"
              : through && through < stats.today
                ? `through ${formatShortDate(through)}`
                : null,
        },
      ]
    : [
        {
          label: "Per day",
          value: kr(coveredDays ? summary.spent / coveredDays : 0),
          hint: null,
        },
        {
          label: "Biggest day",
          value: biggestDay.spent ? kr(biggestDay.spent) : "—",
          hint: biggestDay.spent ? formatShortDate(biggestDay.date) : null,
        },
      ]

  return (
    <div className="bg-background flex min-h-dvh flex-col pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)] select-none [-webkit-tap-highlight-color:transparent]">
      <header className="bg-background/90 supports-backdrop-filter:backdrop-blur sticky top-0 z-20 border-b pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-2 px-4">
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="text-lg leading-tight font-semibold tracking-tight">
              {MONTHS_LONG[month - 1]}{" "}
              <span className="text-muted-foreground font-normal">{year}</span>
            </span>
            {!stats.loading && (
              <div className="flex items-center gap-2">
                <DataThrough
                  dataThrough={stats.dataThrough}
                  today={stats.today}
                />
                {countTransfers && <TransfersCountedChip />}
              </div>
            )}
          </div>
          <button
            type="button"
            aria-label="Toggle theme"
            onClick={() =>
              setTheme(resolvedTheme === "dark" ? "light" : "dark")
            }
            className="text-muted-foreground active:bg-muted flex size-11 items-center justify-center"
          >
            <Sun className="size-5 dark:hidden" />
            <Moon className="hidden size-5 dark:block" />
          </button>
          <Link
            href="/"
            aria-label="Full dashboard"
            className="text-muted-foreground active:bg-muted flex size-11 items-center justify-center"
          >
            <LayoutDashboard className="size-5" />
          </Link>
        </div>
      </header>

      <main
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        className="mx-auto w-full max-w-5xl flex-1 px-3 pt-3 pb-[calc(5rem+env(safe-area-inset-bottom))]"
      >
        {stats.loading ? (
          <div className="grid gap-3 min-[600px]:grid-cols-2" aria-busy="true">
            <Skeleton className="h-32" />
            <Skeleton className="h-44" />
            <Skeleton className="h-20" />
            <Skeleton className="h-72" />
          </div>
        ) : !stats.hasData ? (
          <div className="flex flex-col gap-3">
            <Panel title={`Budget · ${MONTHS_LONG[month - 1]}`}>
              <BudgetKpi
                income={focus?.budgetIncome ?? 0}
                bills={focus?.budgetBills ?? 0}
                savings={focus?.budgetSavings ?? 0}
              />
            </Panel>
            <p className="text-muted-foreground py-8 text-center text-sm">
              No bank data for {year} yet. Import transactions on the full site
              to see spending here.
            </p>
          </div>
        ) : (
          <div
            key={`${year}-${month}`}
            className={cn(
              "grid grid-cols-[minmax(0,1fr)] items-start gap-3 duration-300 motion-safe:animate-in motion-safe:fade-in-0 min-[600px]:grid-cols-2",
              direction === 1
                ? "motion-safe:slide-in-from-right-4"
                : "motion-safe:slide-in-from-left-4",
            )}
          >
            <div className="flex min-w-0 flex-col gap-3">
              <section
                className={cn(
                  "bg-card ring-foreground/5 flex items-center justify-between gap-4 p-4 shadow-sm ring-1",
                  isCurrent && "order-2",
                )}
              >
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="text-muted-foreground text-[11px] font-semibold tracking-widest uppercase">
                    {left.label}
                  </span>
                  <span
                    className={cn(
                      "text-4xl font-semibold tracking-tight",
                      left.value >= 0 ? up : down,
                    )}
                  >
                    {signedKr(left.value)}
                  </span>
                  <span className="text-muted-foreground text-xs tabular-nums">
                    {left.note ??
                      `in ${kr(summary.income)} · out ${kr(summary.spent)}`}
                  </span>
                </div>
                <SavingsRing
                  rate={left.rate}
                  size={92}
                  stroke={8}
                  expected={left.expected}
                />
              </section>

              <section
                className={cn(
                  "bg-card ring-foreground/5 flex flex-col gap-2 p-4 shadow-sm ring-1",
                  isCurrent && "order-1",
                )}
              >
                <span className="text-muted-foreground text-[11px] font-semibold tracking-widest uppercase">
                  Pace vs usual
                </span>
                <PaceSummary
                  pace={pace}
                  status={focus.status}
                  dataThrough={stats.dataThrough}
                  size="lg"
                />
              </section>

              <div
                className={cn("grid grid-cols-2 gap-3", isCurrent && "order-3")}
              >
                {tiles.map((t) => (
                  <section
                    key={t.label}
                    className="bg-card ring-foreground/5 flex flex-col gap-0.5 p-3 shadow-sm ring-1"
                  >
                    <span className="text-muted-foreground text-[11px] font-semibold tracking-widest uppercase">
                      {t.label}
                    </span>
                    <span className="text-2xl font-semibold tracking-tight">
                      {t.value}
                    </span>
                    {t.hint && (
                      <span className="text-muted-foreground text-[11px]">
                        {t.hint}
                      </span>
                    )}
                  </section>
                ))}
              </div>

              <section
                className={cn(
                  "bg-card ring-foreground/5 flex flex-col gap-2 p-3 shadow-sm ring-1",
                  isCurrent && "order-4",
                )}
              >
                <MonthHeatmap
                  days={monthDays}
                  scale={scale}
                  today={stats.today}
                  selected={selectedDay}
                  onSelectDay={setSelectedDay}
                  variant="compact"
                />
                <HeatLegend scale={scale} compact />
              </section>
            </div>

            <div className="flex min-w-0 flex-col gap-3">
              <Panel title="Pace curve">
                <PaceChart pace={pace} height={200} />
              </Panel>
              <Panel title="Where it went" subtitle="vs your usual month">
                <div className="flex flex-col gap-6">
                  <CategoryBreakdown
                    categories={stats.categories}
                    palette={palette}
                    compareBaseline
                    limit={6}
                  />
                  <SetAside savings={stats.savings} inProgress={isCurrent} />
                </div>
              </Panel>
              <Panel title="Month history" subtitle={String(year)}>
                <CashflowChart
                  months={stats.months}
                  focusMonth={month}
                  height={160}
                  rateHeight={80}
                  onMonthClick={setMonth}
                />
              </Panel>
              <Panel title="Top merchants">
                <TopMerchants merchants={stats.topMerchants} limit={5} />
              </Panel>
            </div>
          </div>
        )}
      </main>

      <nav
        aria-label="Month"
        className="bg-background/90 supports-backdrop-filter:backdrop-blur fixed inset-x-0 bottom-0 z-20 border-t pb-[env(safe-area-inset-bottom)]"
      >
        <div className="mx-auto grid h-16 max-w-md grid-cols-[4rem_1fr_4rem] items-stretch">
          <button
            type="button"
            aria-label="Previous month"
            onClick={() => step(-1)}
            className="active:bg-muted flex items-center justify-center"
          >
            <ChevronLeft className="size-6" />
          </button>
          <button
            type="button"
            onClick={goToday}
            className="active:bg-muted flex flex-col items-center justify-center"
          >
            <span className="text-sm font-semibold tracking-widest uppercase">
              {MONTHS_LONG[month - 1].slice(0, 3)} {year}
            </span>
            <span className="text-muted-foreground text-[10px] tracking-widest uppercase">
              {isCurrent ? "this month" : "tap for today"}
            </span>
          </button>
          <button
            type="button"
            aria-label="Next month"
            onClick={() => step(1)}
            className="active:bg-muted flex items-center justify-center"
          >
            <ChevronRight className="size-6" />
          </button>
        </div>
      </nav>

      <DaySheet
        side="bottom"
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
