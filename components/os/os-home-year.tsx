"use client"

import type { MonthStat } from "@/lib/stats/types"
import { MONTHS_LONG } from "@/lib/budget"
import { cn } from "@/lib/utils"
import { CashKpi } from "@/components/dashboard/hero-kpis"
import { Panel } from "@/components/stats/panel"
import { SavingsRing } from "@/components/stats/savings-ring"
import { CashflowChart } from "@/components/stats/cashflow-chart"
import { WealthChart } from "@/components/stats/wealth-chart"
import { CategoryBreakdown } from "@/components/stats/category-breakdown"
import { TopMerchants } from "@/components/stats/top-merchants"
import { SetAside } from "@/components/stats/set-aside"
import { HeatLegend, YearHeatmap } from "@/components/stats/spending-heatmap"
import type { useVizData } from "@/components/stats/use-viz-data"
import { down, kr, pct, signedKr, up } from "@/components/stats/display"
import { useOs } from "@/components/os/os-shell"

const label = "text-muted-foreground text-[11px] font-semibold tracking-widest uppercase"
const tile = "bg-card ring-foreground/5 flex flex-col gap-0.5 p-3 shadow-sm ring-1"

/** Home in year view: how the year (so far) is going. */
export function OsHomeYear({
  viz,
  selectedDay,
  onSelectDay,
}: {
  viz: ReturnType<typeof useVizData>
  selectedDay: string | null
  onSelectDay: (date: string) => void
}) {
  const { year, direction, openMonth, stats } = useOs()
  const { heatMonths, scale, palette } = viz
  const { summary } = stats
  const isCurrentYear = stats.today.startsWith(String(year))
  const dataMonths = stats.months.filter(
    (m) => m.status !== "future" && m.status !== "no-data",
  ).length
  const { monthsCounted: full, bestMonth, worstMonth } = summary

  return (
    <div
      key={year}
      className={cn(
        "flex flex-col gap-3 duration-300 motion-safe:animate-in motion-safe:fade-in-0",
        direction === 1
          ? "motion-safe:slide-in-from-right-4"
          : "motion-safe:slide-in-from-left-4",
      )}
    >
      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-3 min-[600px]:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-3">
          <section className="bg-card ring-foreground/5 flex items-center justify-between gap-4 p-4 shadow-sm ring-1">
            <div className="flex min-w-0 flex-col gap-1">
              <span className={label}>
                {isCurrentYear ? "Net saved so far" : `Kept in ${year}`}
              </span>
              <span
                className={cn(
                  "text-4xl font-semibold tracking-tight",
                  summary.net >= 0 ? up : down,
                )}
              >
                {signedKr(summary.net)}
              </span>
              <span className="text-muted-foreground text-xs tabular-nums">
                in {kr(summary.income)} · out {kr(summary.spent)}
              </span>
              {!isCurrentYear && dataMonths < 12 && (
                <span className="text-muted-foreground text-[11px]">
                  {dataMonths} of 12 months imported
                </span>
              )}
            </div>
            <SavingsRing rate={summary.savingsRate} size={92} stroke={8} />
          </section>

          <div className="grid grid-cols-2 gap-3">
            <section className={tile}>
              <span className={label}>Avg month</span>
              <span className="text-2xl font-semibold tracking-tight">
                {full ? kr(summary.avgMonthlySpent) : "—"}
              </span>
              <span className="text-muted-foreground text-[11px]">
                {full
                  ? `spent · ${full} full month${full === 1 ? "" : "s"}`
                  : "no full month yet"}
              </span>
            </section>
            <section className={tile}>
              <span className={label}>Set aside</span>
              <span className="text-2xl font-semibold tracking-tight">
                {kr(summary.saved)}
              </span>
              <span className="text-muted-foreground text-[11px]">
                {summary.budgetSavings > 0
                  ? `of ${kr(summary.budgetSavings)} budgeted`
                  : "into savings groups"}
              </span>
            </section>
            <MonthTile title="Best month" month={bestMonth} onOpen={openMonth} />
            <MonthTile
              title="Worst month"
              month={worstMonth}
              onOpen={openMonth}
            />
          </div>

          <Panel title="Vs budget" subtitle="Tick = budget for the same months">
            <CashKpi summary={summary} />
          </Panel>
        </div>

        <div className="flex min-w-0 flex-col gap-3">
          <Panel title="Month by month" subtitle="Tap a month to open it">
            <CashflowChart
              months={stats.months}
              height={180}
              rateHeight={80}
              onMonthClick={openMonth}
            />
          </Panel>
          <Panel title="Wealth built" subtitle="Cumulative net saved">
            <WealthChart months={stats.months} height={180} />
          </Panel>
        </div>
      </div>

      <Panel
        title="Spending calendar"
        subtitle="Tap a day, or a month name to open it"
      >
        <div className="flex flex-col gap-4">
          <YearHeatmap
            months={heatMonths}
            scale={scale}
            today={stats.today}
            selected={selectedDay}
            onSelectDay={onSelectDay}
            onSelectMonth={openMonth}
          />
          <HeatLegend scale={scale} compact />
        </div>
      </Panel>

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-3 min-[600px]:grid-cols-2">
        <Panel title="Where it went" subtitle={String(year)}>
          <div className="flex flex-col gap-6">
            <CategoryBreakdown
              categories={stats.categories}
              palette={palette}
              compareBaseline={false}
              limit={8}
            />
            <SetAside savings={stats.savings} inProgress={isCurrentYear} />
          </div>
        </Panel>
        <Panel title="Top merchants" subtitle={String(year)}>
          <TopMerchants merchants={stats.topMerchants} limit={8} />
        </Panel>
      </div>
    </div>
  )
}

function MonthTile({
  title,
  month,
  onOpen,
}: {
  title: string
  month: MonthStat | null
  onOpen: (month: number) => void
}) {
  if (!month) {
    return (
      <section className={tile}>
        <span className={label}>{title}</span>
        <span className="text-2xl font-semibold tracking-tight">—</span>
        <span className="text-muted-foreground text-[11px]">
          no full month yet
        </span>
      </section>
    )
  }
  const rate = month.savingsRate ?? 0
  return (
    <button
      type="button"
      onClick={() => onOpen(month.month)}
      aria-label={`${title}: ${MONTHS_LONG[month.month - 1]}, open it`}
      className={cn(tile, "active:bg-muted min-h-11 text-left")}
    >
      <span className={label}>{title}</span>
      <span className="truncate text-2xl font-semibold tracking-tight">
        {MONTHS_LONG[month.month - 1]}
      </span>
      <span
        className={cn("text-[11px] tabular-nums", rate >= 0 ? up : down)}
      >
        {pct(month.savingsRate)} kept · {signedKr(month.net)}
      </span>
    </button>
  )
}
