"use client"

import type { AllTimeStats, YearStat } from "@/lib/stats/alltime"
import { MONTHS_SHORT } from "@/lib/budget"
import { cn } from "@/lib/utils"
import { Panel } from "@/components/stats/panel"
import { CategoryBreakdown } from "@/components/stats/category-breakdown"
import { TopMerchants } from "@/components/stats/top-merchants"
import { categoryPalette, down, kr, pct, signedKr, up } from "@/components/stats/display"
import {
  FlowLegend,
  LifetimeNetChart,
  RollingAverageChart,
  YearlyFlowChart,
} from "@/components/stats/alltime-charts"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

function Big({ value, className }: { value: string; className?: string }) {
  return <p className={cn("text-3xl font-semibold tracking-tight tabular-nums", className)}>{value}</p>
}

function Line({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("font-medium tabular-nums", className)}>{value}</span>
    </div>
  )
}

/** Years with enough complete months for a fair best/weakest verdict. */
const ratedYears = (years: YearStat[]) =>
  years.filter((y) => y.monthsComplete >= 3 && y.avgMonthlyIncome && y.avgMonthlyIncome > 0)

const yearRate = (y: YearStat) => (y.avgMonthlyNet ?? 0) / (y.avgMonthlyIncome || 1)

export function AllTimeView({
  stats,
  onOpenYear,
}: {
  stats: AllTimeStats
  onOpenYear: (year: number) => void
}) {
  const { summary, years } = stats
  const n = summary.monthsCounted
  const avgNet = summary.avgMonthlyIncome - summary.avgMonthlySpent
  const firstComplete = stats.months.find((m) => m.status === "complete")
  const lastComplete = [...stats.months].reverse().find((m) => m.status === "complete")
  const span =
    firstComplete && lastComplete
      ? `${MONTHS_SHORT[firstComplete.month - 1]} ${firstComplete.year} – ${MONTHS_SHORT[lastComplete.month - 1]} ${lastComplete.year}`
      : ""
  const rated = ratedYears(years)
  const best = rated.reduce<YearStat | null>((b, y) => (!b || yearRate(y) > yearRate(b) ? y : b), null)
  const worst = rated.reduce<YearStat | null>((b, y) => (!b || yearRate(y) < yearRate(b) ? y : b), null)
  const palette = categoryPalette(stats.categoryHistory)
  const completeMonths = stats.months.filter((m) => m.status === "complete")
  const bestMonth = completeMonths.reduce<(typeof completeMonths)[number] | null>(
    (b, m) => (!b || m.net > b.net ? m : b),
    null,
  )
  const worstMonth = completeMonths.reduce<(typeof completeMonths)[number] | null>(
    (b, m) => (!b || m.net < b.net ? m : b),
    null,
  )

  if (n === 0) {
    return (
      <Panel title="All time">
        <p className="text-muted-foreground py-8 text-center text-sm">
          No fully imported month yet. All-time averages only count complete months.
        </p>
      </Panel>
    )
  }

  return (
    <>
      <p className="text-muted-foreground -mt-2 text-xs">
        Averages and totals use the {n} fully imported months ({span}); partly covered months and
        the current month are left out so they can&apos;t skew a typical month.
      </p>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Panel title="Average month" subtitle="Income vs spent, per complete month">
          <div className="flex flex-col gap-2">
            <Big value={signedKr(avgNet)} className={avgNet >= 0 ? up : down} />
            <p className="text-muted-foreground text-xs">
              {avgNet >= 0
                ? `You keep ${kr(avgNet)} of what comes in, on average each month.`
                : `You spend ${kr(-avgNet)} more than comes in, on average each month.`}
            </p>
            <Line label="Income / mo" value={kr(summary.avgMonthlyIncome)} />
            <Line label="Spent / mo" value={kr(summary.avgMonthlySpent)} />
          </div>
        </Panel>

        <Panel title="Savings rate" subtitle="All time, income-weighted">
          <div className="flex flex-col gap-2">
            <Big
              value={pct(summary.avgSavingsRate)}
              className={summary.avgSavingsRate != null && summary.avgSavingsRate < 0 ? down : undefined}
            />
            <p className="text-muted-foreground text-xs">Share of all income left unspent.</p>
            {best && <Line label={`Best year · ${best.year}`} value={pct(yearRate(best))} className={up} />}
            {worst && worst !== best && (
              <Line label={`Weakest year · ${worst.year}`} value={pct(yearRate(worst))} className={down} />
            )}
          </div>
        </Panel>

        <Panel title="Net over all months" subtitle="Total income − total spent">
          <div className="flex flex-col gap-2">
            <Big value={signedKr(summary.net)} className={summary.net >= 0 ? up : down} />
            <p className="text-muted-foreground text-xs">Over {n} complete months.</p>
            <Line label="Total income" value={kr(summary.income)} />
            <Line label="Total spent" value={kr(summary.spent)} />
          </div>
        </Panel>

        <Panel title="Months in the red" subtitle="Spent more than came in">
          <div className="flex flex-col gap-2">
            <Big value={`${stats.deficitMonths} / ${n}`} />
            <p className="text-muted-foreground text-xs">
              {pct(stats.deficitMonths / n)} of complete months ended below zero.
            </p>
            {worstMonth && (
              <Line
                label={`Weakest · ${MONTHS_SHORT[worstMonth.month - 1]} ${worstMonth.year}`}
                value={signedKr(worstMonth.net)}
                className={down}
              />
            )}
            {bestMonth && (
              <Line
                label={`Best · ${MONTHS_SHORT[bestMonth.month - 1]} ${bestMonth.year}`}
                value={signedKr(bestMonth.net)}
                className={up}
              />
            )}
          </div>
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <Panel
          title="Year by year"
          subtitle="Average month in each year, with savings rate · tap a year to open it"
          action={<FlowLegend />}
          className="lg:col-span-3"
        >
          <YearlyFlowChart years={years.filter((y) => y.monthsComplete > 0)} onYearClick={onOpenYear} />
        </Panel>
        <Panel title="Net since the start" subtitle="Running income − spent" className="lg:col-span-2">
          <LifetimeNetChart months={stats.months} height={330} />
        </Panel>
      </div>

      <Panel
        title="Trend"
        subtitle="Rolling 12-month average per month · smooths out seasons and one-off months"
        action={<FlowLegend />}
      >
        <RollingAverageChart rolling={stats.rolling} />
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Where it went" subtitle="All time, by category · bar = share of spending">
          <CategoryBreakdown categories={stats.categories} palette={palette} compareBaseline={false} limit={12} />
        </Panel>
        <Panel title="Top merchants" subtitle="All time">
          <TopMerchants merchants={stats.topMerchants} limit={15} />
        </Panel>
      </div>

      <Panel title="The numbers" subtitle="Per year · averages over complete months · tap a year to open it">
        <Table className="text-sm">
          <TableHeader>
            <TableRow>
              <TableHead>Year</TableHead>
              <TableHead className="text-right">Months</TableHead>
              <TableHead className="text-right">Income / mo</TableHead>
              <TableHead className="text-right">Spent / mo</TableHead>
              <TableHead className="text-right">Net / mo</TableHead>
              <TableHead className="text-right">Rate</TableHead>
              <TableHead className="hidden text-right md:table-cell">Year net</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[...years].reverse().map((y) => (
              <TableRow key={y.year} onClick={() => onOpenYear(y.year)} className="cursor-pointer tabular-nums">
                <TableCell className="font-medium">
                  {y.year}
                  {rated.length > 1 && best?.year === y.year && (
                    <span className={cn("ml-2 text-[10px] font-semibold tracking-widest uppercase", up)}>best</span>
                  )}
                  {rated.length > 1 && worst?.year === y.year && worst !== best && (
                    <span className={cn("ml-2 text-[10px] font-semibold tracking-widest uppercase", down)}>
                      weakest
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground text-right">
                  {y.monthsComplete}
                  {y.monthsWithData > y.monthsComplete && `+${y.monthsWithData - y.monthsComplete}`}
                </TableCell>
                <TableCell className="text-right">{y.avgMonthlyIncome == null ? "—" : kr(y.avgMonthlyIncome)}</TableCell>
                <TableCell className="text-right">{y.avgMonthlySpent == null ? "—" : kr(y.avgMonthlySpent)}</TableCell>
                <TableCell
                  className={cn(
                    "text-right",
                    y.avgMonthlyNet == null ? "" : y.avgMonthlyNet >= 0 ? up : down,
                  )}
                >
                  {y.avgMonthlyNet == null ? "—" : signedKr(y.avgMonthlyNet)}
                </TableCell>
                <TableCell className="text-right">
                  {y.avgMonthlyIncome ? pct(yearRate(y)) : "—"}
                </TableCell>
                <TableCell className={cn("hidden text-right md:table-cell", y.net >= 0 ? up : down)}>
                  {signedKr(y.net)}
                </TableCell>
              </TableRow>
            ))}
            <TableRow className="border-t-2 font-semibold tabular-nums">
              <TableCell>All time</TableCell>
              <TableCell className="text-right">{n}</TableCell>
              <TableCell className="text-right">{kr(summary.avgMonthlyIncome)}</TableCell>
              <TableCell className="text-right">{kr(summary.avgMonthlySpent)}</TableCell>
              <TableCell className={cn("text-right", avgNet >= 0 ? up : down)}>{signedKr(avgNet)}</TableCell>
              <TableCell className="text-right">{pct(summary.avgSavingsRate)}</TableCell>
              <TableCell className={cn("hidden text-right md:table-cell", summary.net >= 0 ? up : down)}>
                {signedKr(summary.net)}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
        <p className="text-muted-foreground mt-2 text-xs">
          Months = complete (+ partly covered). Year net includes partly covered months.
        </p>
      </Panel>
    </>
  )
}
