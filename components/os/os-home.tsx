"use client"

import { useState } from "react"

import { MONTHS_LONG } from "@/lib/budget"
import { cn } from "@/lib/utils"
import { Skeleton } from "@/components/ui/skeleton"
import { BudgetKpi } from "@/components/dashboard/hero-kpis"
import { Panel } from "@/components/stats/panel"
import { SavingsRing } from "@/components/stats/savings-ring"
import { PaceSummary } from "@/components/stats/pace-summary"
import { PaceChart } from "@/components/stats/pace-chart"
import { CashflowChart } from "@/components/stats/cashflow-chart"
import { CategoryBreakdown } from "@/components/stats/category-breakdown"
import { TopMerchants } from "@/components/stats/top-merchants"
import { HeatLegend, MonthHeatmap } from "@/components/stats/spending-heatmap"
import { DaySheet } from "@/components/stats/day-sheet"
import { SetAside } from "@/components/stats/set-aside"
import { useVizData } from "@/components/stats/use-viz-data"
import {
  down,
  formatShortDate,
  kr,
  leftThisMonth,
  signedKr,
  up,
} from "@/components/stats/display"
import { useOs } from "@/components/os/os-shell"
import { OsHomeYear } from "@/components/os/os-home-year"

/**
 * Home tab. Folded (narrow) = the glance column fills one screen;
 * unfolded (≥600px) = glance + detail side by side. Year view: OsHomeYear.
 */
export function OsHome() {
  const { year, month, period, direction, setMonth, stats } = useOs()
  const viz = useVizData(stats)
  const { heatMonths, scale, palette } = viz
  const [selectedDay, setSelectedDay] = useState<string | null>(null)

  const focus = stats.months[month - 1]
  const isCurrent = focus?.status === "current"
  const isYear = period === "year"
  const empty = !stats.hasData || (!isYear && focus?.status === "future")
  const notStarted = isYear
    ? year > Number(stats.today.slice(0, 4))
    : focus?.status === "future"
  const budgetMonths = isYear ? stats.months : focus ? [focus] : []
  const budgetTotal = (key: "budgetIncome" | "budgetBills" | "budgetSavings") =>
    budgetMonths.reduce((s, m) => s + m[key], 0)
  const hasBudget = budgetMonths.some(
    (m) => m.budgetIncome || m.budgetBills || m.budgetSavings,
  )
  const periodName = isYear ? String(year) : `${MONTHS_LONG[month - 1]} ${year}`
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
    <>
      {stats.loading ? (
        <div className="grid gap-3 min-[600px]:grid-cols-2" aria-busy="true">
          <Skeleton className="h-32" />
          <Skeleton className="h-44" />
          <Skeleton className="h-20" />
          <Skeleton className="h-72" />
        </div>
      ) : empty ? (
        <div className="flex flex-col gap-3">
          <Panel title={`Budget · ${isYear ? year : MONTHS_LONG[month - 1]}`}>
            <BudgetKpi
              income={budgetTotal("budgetIncome")}
              bills={budgetTotal("budgetBills")}
              savings={budgetTotal("budgetSavings")}
            />
          </Panel>
          <p className="text-muted-foreground py-8 text-center text-sm">
            {notStarted
              ? hasBudget
                ? `${periodName} hasn't started yet. This is what the budget plans.`
                : `${periodName} hasn't started yet, and has no budget.`
              : `No bank data for ${periodName} yet. Import transactions on the full site to see spending here.`}
          </p>
        </div>
      ) : isYear ? (
        <OsHomeYear
          viz={viz}
          selectedDay={selectedDay}
          onSelectDay={setSelectedDay}
        />
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
    </>
  )
}
