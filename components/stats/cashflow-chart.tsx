"use client"

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts"

import type { MonthStat } from "@/lib/stats/types"
import { MONTHS_SHORT } from "@/lib/budget"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { compact, kr, pct } from "@/components/stats/display"

const config: ChartConfig = {
  income: { label: "Income", color: "var(--viz-income)" },
  spent: { label: "Spent", color: "var(--viz-spent)" },
  rate: { label: "Savings rate", color: "var(--primary)" },
}

// One outlier month (income barely in) would flatten the strip; plot within
// ±100 % and print the true rate in the tooltip.
const clampRate = (r: number) =>
  Math.max(-100, Math.min(100, Math.round(r * 100)))

const empty = (m: MonthStat) => m.status === "future" || m.status === "no-data"

/**
 * Income vs spending per month, with the savings rate as its own strip below
 * (shared x-axis, separate scale - never a second y-axis on the same plot).
 */
export function CashflowChart({
  months,
  focusMonth,
  height = 220,
  rateHeight = 90,
  onMonthClick,
}: {
  months: MonthStat[]
  focusMonth?: number
  height?: number
  rateHeight?: number
  onMonthClick?: (month: number) => void
}) {
  const data = months.map((m) => ({
    label: MONTHS_SHORT[m.month - 1],
    month: m.month,
    status: m.status,
    income: empty(m) ? null : m.income,
    spent: empty(m) ? null : m.spent,
    // Only finished months: an unfinished month's rate swings wildly before payday.
    rate:
      m.status !== "complete" || m.savingsRate == null
        ? null
        : clampRate(m.savingsRate),
    trueRate: m.savingsRate,
  }))
  const dim = (m: (typeof data)[number]) => (m.status === "complete" ? 1 : 0.45)
  const focusLabel = focusMonth ? MONTHS_SHORT[focusMonth - 1] : null
  const click = onMonthClick
    ? (d: { payload?: { month?: number } }) => {
        if (d.payload?.month) {
          onMonthClick(d.payload.month)
        }
      }
    : undefined

  const tooltip = (
    <ChartTooltip
      content={
        <ChartTooltipContent
          labelFormatter={(_, payload) => {
            const p = payload?.[0]?.payload as (typeof data)[number] | undefined
            if (!p) {
              return ""
            }
            return p.status === "complete"
              ? p.label
              : `${p.label} · ${p.status}`
          }}
          formatter={(value, name, item) => (
            <div className="flex w-full justify-between gap-3">
              <span className="text-muted-foreground">
                {config[name as keyof typeof config]?.label ?? name}
              </span>
              <span className="font-medium tabular-nums">
                {name === "rate"
                  ? pct((item.payload as (typeof data)[number]).trueRate)
                  : kr(Number(value))}
              </span>
            </div>
          )}
        />
      }
    />
  )

  return (
    <div className="flex flex-col">
      <ChartContainer
        config={config}
        style={{ height }}
        className="aspect-auto w-full"
      >
        <BarChart
          data={data}
          syncId="cashflow"
          margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
          barGap={2}
        >
          <CartesianGrid vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} hide />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={40}
            tickFormatter={(v) => compact(Number(v))}
          />
          {focusLabel && (
            <ReferenceArea
              x1={focusLabel}
              x2={focusLabel}
              fill="var(--muted-foreground)"
              fillOpacity={0.08}
            />
          )}
          {tooltip}
          <Bar
            dataKey="income"
            fill="var(--color-income)"
            radius={[2, 2, 0, 0]}
            maxBarSize={14}
            onClick={click}
          >
            {data.map((d) => (
              <Cell
                key={d.month}
                fillOpacity={dim(d)}
                className={onMonthClick ? "cursor-pointer" : undefined}
              />
            ))}
          </Bar>
          <Bar
            dataKey="spent"
            fill="var(--color-spent)"
            radius={[2, 2, 0, 0]}
            maxBarSize={14}
            onClick={click}
          >
            {data.map((d) => (
              <Cell
                key={d.month}
                fillOpacity={dim(d)}
                className={onMonthClick ? "cursor-pointer" : undefined}
              />
            ))}
          </Bar>
        </BarChart>
      </ChartContainer>
      <ChartContainer
        config={config}
        style={{ height: rateHeight }}
        className="aspect-auto w-full"
      >
        <LineChart
          data={data}
          syncId="cashflow"
          margin={{ top: 10, right: 8, bottom: 0, left: 0 }}
        >
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            interval={0}
            fontSize={10}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={40}
            tickCount={3}
            tickFormatter={(v) => `${v}%`}
          />
          <ReferenceLine y={0} stroke="var(--border)" />
          {tooltip}
          <Line
            dataKey="rate"
            stroke="var(--color-rate)"
            strokeWidth={2}
            connectNulls={false}
            dot={{
              r: 3.5,
              strokeWidth: 2,
              stroke: "var(--card)",
              fill: "var(--color-rate)",
            }}
            activeDot={{ r: 5, strokeWidth: 2, stroke: "var(--card)" }}
            isAnimationActive={false}
          />
        </LineChart>
      </ChartContainer>
      <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 pl-10 text-[11px]">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 bg-(--viz-income)" /> Income
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 bg-(--viz-spent)" /> Spent
        </span>
        <span className="flex items-center gap-1.5">
          <span className="bg-primary h-0.5 w-4" /> Savings rate (complete
          months)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 bg-(--viz-income) opacity-45" /> Incomplete
          month
        </span>
      </div>
    </div>
  )
}
