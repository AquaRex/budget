"use client"

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts"

import type { GoalProjection } from "@/lib/goals/compute"
import { cn } from "@/lib/utils"
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { compact, kr } from "@/components/stats/display"
import { monthLabel } from "@/components/savings/format"

const MAX_GROUPS = 8

type Impact = { key: string; label: string; detail: string; value: number }

const perMonth = (n: number) => `${kr(Math.round(Math.abs(n)))}/mo`
const signed = (n: number) =>
  `${Math.round(n) > 0 ? "+" : Math.round(n) < 0 ? "−" : ""}${perMonth(n)}`

/**
 * Where the monthly saving the goal needs is won and lost: the budget against
 * what's needed, then income and every spending group against the budget.
 * + helps reach the goal, − pushes it away.
 */
export function GoalBreakdown({ p }: { p: GoalProjection }) {
  const need = p.needPerMonth ?? 0
  const groups = p.groupDiffs.map((g) => ({
    key: `g-${g.id ?? "none"}`,
    label: g.name,
    detail: `spent ${perMonth(g.actual)} · budget ${perMonth(g.budget)}`,
    value: -g.perMonth,
  }))
  const ranked = [...groups].sort(
    (a, b) => Math.abs(b.value) - Math.abs(a.value),
  )
  const shown = ranked.slice(0, MAX_GROUPS).sort((a, b) => a.value - b.value)
  const rest = ranked.slice(MAX_GROUPS)
  const rows: Impact[] = [
    {
      key: "budget",
      label: "Budget vs what the goal needs",
      detail: `budget saves ${perMonth(p.budgetPerMonth)} · goal needs ${perMonth(need)}`,
      value: p.budgetPerMonth - need,
    },
    ...(p.diffMonths
      ? [
          {
            key: "income",
            label: "Income vs budget",
            detail:
              p.incomeDiffPerMonth < 0 ? "below budget" : "at or above budget",
            value: p.incomeDiffPerMonth,
          },
          ...shown,
        ]
      : []),
    ...(rest.length
      ? [
          {
            key: "rest",
            label: `${rest.length} other group${rest.length === 1 ? "" : "s"}`,
            detail: "combined",
            value: rest.reduce((s, r) => s + r.value, 0),
          },
        ]
      : []),
  ]
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.value)))

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-0.5">
        <h3 className="text-sm font-semibold">Where the gap comes from</h3>
        <p className="text-muted-foreground text-xs">
          Per month. Bars to the left push the goal away, bars to the right
          help.
          {p.diffMonths > 0 &&
            ` Income and groups compare this year's ${p.diffMonths} complete month${p.diffMonths === 1 ? "" : "s"} with the budget.`}
        </p>
      </div>

      <ul className="flex flex-col">
        {rows.map((r) => {
          const width = `${(Math.abs(r.value) / max) * 50}%`
          const hurts = r.value < -0.5
          const helps = r.value > 0.5
          return (
            <li
              key={r.key}
              className={cn(
                "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 py-1.5 sm:grid-cols-[minmax(0,15rem)_minmax(0,1fr)_7rem]",
                r.key === "budget" && "mb-1 border-b pb-2.5",
              )}
              title={`${r.label}: ${signed(r.value)} (${r.detail})`}
            >
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-sm">{r.label}</span>
                <span className="text-muted-foreground text-[11px]">
                  {r.detail}
                </span>
              </span>
              <span className="relative col-span-2 h-4 sm:order-2 sm:col-span-1">
                <span className="bg-border absolute inset-y-[-4px] left-1/2 w-px" />
                {(hurts || helps) && (
                  <span
                    className={cn(
                      "absolute inset-y-0",
                      hurts
                        ? "right-1/2 rounded-l-sm bg-rose-500/80 dark:bg-rose-400/80"
                        : "left-1/2 rounded-r-sm bg-emerald-500/80 dark:bg-emerald-400/80",
                    )}
                    style={{ width }}
                  />
                )}
              </span>
              <span
                className={cn(
                  "order-first col-start-2 row-start-1 text-right text-sm font-medium tabular-nums sm:order-3 sm:col-start-3",
                  hurts && "text-rose-700 dark:text-rose-400",
                  helps && "text-emerald-700 dark:text-emerald-400",
                )}
              >
                {signed(r.value)}
              </span>
            </li>
          )
        })}
      </ul>

      {p.recent.length > 1 && <RecentMonths p={p} need={need} />}
    </section>
  )
}

const config: ChartConfig = {
  actual: { label: "Saved", color: "var(--viz-cat-1)" },
  budget: { label: "Budget planned", color: "var(--viz-baseline)" },
}

/** What each recent month actually saved, against the budget's plan and what the goal needs. */
function RecentMonths({ p, need }: { p: GoalProjection; need: number }) {
  const data = p.recent.map((m) => ({
    label: monthLabel(m.monthIndex),
    actual: Math.round(m.actual),
    budget: Math.round(m.budget),
  }))
  const short = p.recent.filter((m) => m.actual < need).length
  return (
    <div className="flex flex-col gap-1">
      <h4 className="text-sm font-semibold">Month by month</h4>
      <p className="text-muted-foreground text-xs">
        What you actually saved (income minus spending) each month, against what
        the budget planned. {short} of the last {p.recent.length} months saved
        less than the goal needs ({perMonth(need)}).
      </p>
      <ChartContainer
        config={config}
        style={{ height: 220 }}
        className="aspect-auto w-full"
      >
        <ComposedChart
          data={data}
          margin={{ top: 16, right: 64, bottom: 0, left: 0 }}
        >
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            fontSize={10}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={44}
            tickFormatter={(v) => compact(Number(v))}
          />
          <ChartTooltip
            content={
              <ChartTooltipContent
                formatter={(value, name) => (
                  <div className="flex w-full justify-between gap-3">
                    <span className="text-muted-foreground">
                      {config[name as keyof typeof config]?.label}
                    </span>
                    <span className="font-medium tabular-nums">
                      {kr(Number(value))}
                    </span>
                  </div>
                )}
              />
            }
          />
          <ChartLegend content={<ChartLegendContent />} />
          <ReferenceLine y={0} stroke="var(--border)" />
          {need > 0 && (
            <ReferenceLine
              y={need}
              stroke="var(--foreground)"
              strokeDasharray="4 4"
              label={{
                value: "Goal needs",
                position: "right",
                fontSize: 10,
                fill: "var(--muted-foreground)",
              }}
            />
          )}
          <Bar
            dataKey="actual"
            fill="var(--viz-cat-1)"
            radius={[4, 4, 0, 0]}
            maxBarSize={28}
          />
          <Line
            dataKey="budget"
            type="step"
            stroke="var(--viz-baseline)"
            strokeWidth={2}
            dot={false}
          />
        </ComposedChart>
      </ChartContainer>
    </div>
  )
}
