"use client"

import { useId } from "react"
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts"

import type { MonthStat } from "@/lib/stats/types"
import type { RollingPoint, YearStat } from "@/lib/stats/alltime"
import { MONTHS_SHORT } from "@/lib/budget"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { compact, kr, pct, signedKr } from "@/components/stats/display"

const flowConfig: ChartConfig = {
  income: { label: "Income", color: "var(--viz-income)" },
  spent: { label: "Spent", color: "var(--viz-spent)" },
  rate: { label: "Savings rate", color: "var(--primary)" },
}

const clampRate = (r: number) => Math.max(-100, Math.min(100, Math.round(r * 100)))

/** Two-series legend: swatch + name in text ink (identity is never colour alone). */
export function FlowLegend() {
  return (
    <div className="text-muted-foreground flex items-center gap-4 text-xs">
      {(["income", "spent"] as const).map((k) => (
        <span key={k} className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-[2px]" style={{ background: flowConfig[k].color }} />
          {flowConfig[k].label}
        </span>
      ))}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex w-full justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  )
}

/**
 * Average month per year (complete months only, so a year with 3 imported
 * months compares fairly with a full one), with the year's savings rate as its
 * own strip below - one y-scale per plot.
 */
export function YearlyFlowChart({
  years,
  height = 240,
  rateHeight = 90,
  onYearClick,
}: {
  years: YearStat[]
  height?: number
  rateHeight?: number
  onYearClick?: (year: number) => void
}) {
  const data = years.map((y) => ({
    label: String(y.year),
    year: y.year,
    income: y.avgMonthlyIncome,
    spent: y.avgMonthlySpent,
    monthsComplete: y.monthsComplete,
    rate: y.monthsComplete && y.avgMonthlyIncome ? clampRate((y.avgMonthlyNet ?? 0) / y.avgMonthlyIncome) : null,
    trueRate: y.monthsComplete && y.avgMonthlyIncome ? (y.avgMonthlyNet ?? 0) / y.avgMonthlyIncome : null,
  }))
  const click = onYearClick
    ? (d: { payload?: { year?: number } }) => {
        if (d.payload?.year) onYearClick(d.payload.year)
      }
    : undefined

  const tooltip = (
    <ChartTooltip
      content={
        <ChartTooltipContent
          labelFormatter={(_, payload) => {
            const p = payload?.[0]?.payload as (typeof data)[number] | undefined
            return p ? `${p.label} · avg month (${p.monthsComplete} complete)` : ""
          }}
          formatter={(value, name, item) => (
            <Row
              label={String(flowConfig[name as keyof typeof flowConfig]?.label ?? name)}
              value={
                name === "rate"
                  ? pct((item.payload as (typeof data)[number]).trueRate)
                  : kr(Number(value))
              }
            />
          )}
        />
      }
    />
  )

  return (
    <div className="flex flex-col">
      <ChartContainer config={flowConfig} style={{ height }} className="aspect-auto w-full">
        <BarChart
          data={data}
          syncId="alltime-years"
          margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
          barGap={2}
          // Keep each year's pair together: few years = wide gaps between years, not between the pair.
          barCategoryGap={data.length <= 3 ? "38%" : data.length <= 8 ? "24%" : "16%"}
        >
          <CartesianGrid vertical={false} />
          <XAxis dataKey="label" hide />
          <YAxis tickLine={false} axisLine={false} width={44} tickFormatter={(v) => compact(Number(v))} />
          {tooltip}
          {(["income", "spent"] as const).map((k) => (
            <Bar key={k} dataKey={k} fill={`var(--color-${k})`} radius={[4, 4, 0, 0]} onClick={click}>
              {data.map((d) => (
                <Cell key={d.year} className={onYearClick ? "cursor-pointer" : undefined} />
              ))}
            </Bar>
          ))}
        </BarChart>
      </ChartContainer>
      <ChartContainer config={flowConfig} style={{ height: rateHeight }} className="aspect-auto w-full">
        <LineChart data={data} syncId="alltime-years" margin={{ top: 10, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} />
          {/* band scale: points sit under the middle of each year's bars */}
          <XAxis dataKey="label" scale="band" tickLine={false} axisLine={false} tickMargin={8} interval={0} fontSize={10} />
          <YAxis tickLine={false} axisLine={false} width={44} tickCount={3} tickFormatter={(v) => `${v}%`} />
          <ReferenceLine y={0} stroke="var(--border)" />
          {tooltip}
          <Line
            dataKey="rate"
            stroke="var(--color-rate)"
            strokeWidth={2}
            dot={{ r: 4, strokeWidth: 2, fill: "var(--background)" }}
            connectNulls={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ChartContainer>
    </div>
  )
}

const monthLabel = (m: { year: number; month: number }) => `${MONTHS_SHORT[m.month - 1]} ${m.year}`
const yearTicks = (rows: { year: number; month: number }[]) =>
  rows.filter((r) => r.month === 1).map(monthLabel)

/** Running net (income − spent) since the first imported month. */
export function LifetimeNetChart({ months, height = 260 }: { months: MonthStat[]; height?: number }) {
  const fillId = `life-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`
  const data = months.map((m) => ({
    label: monthLabel(m),
    year: m.year,
    month: m.month,
    net: m.status === "no-data" || m.status === "future" ? null : m.cumulativeNet,
  }))
  const last = [...data].reverse().find((d) => d.net != null)?.net ?? 0
  const color = last >= 0 ? "var(--viz-income)" : "var(--viz-spent)"
  const config: ChartConfig = { net: { label: "Net since start", color } }

  return (
    <ChartContainer config={config} style={{ height }} className="aspect-auto w-full">
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.25} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="label"
          ticks={yearTicks(data)}
          tickFormatter={(v: string) => v.slice(-4)}
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          fontSize={10}
        />
        <YAxis tickLine={false} axisLine={false} width={44} tickFormatter={(v) => compact(Number(v))} />
        <ReferenceLine y={0} stroke="var(--border)" />
        <ChartTooltip
          content={
            <ChartTooltipContent formatter={(value) => <Row label="Net since start" value={signedKr(Number(value))} />} />
          }
        />
        <Area dataKey="net" stroke={color} strokeWidth={2} fill={`url(#${fillId})`} connectNulls isAnimationActive={false} />
      </AreaChart>
    </ChartContainer>
  )
}

/** Trailing 12-complete-month average of income and spending: the trend without seasonality. */
export function RollingAverageChart({ rolling, height = 260 }: { rolling: RollingPoint[]; height?: number }) {
  const data = rolling.map((r) => ({ label: monthLabel(r), ...r }))
  return (
    <ChartContainer config={flowConfig} style={{ height }} className="aspect-auto w-full">
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="label"
          ticks={yearTicks(data)}
          tickFormatter={(v: string) => v.slice(-4)}
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          fontSize={10}
        />
        <YAxis tickLine={false} axisLine={false} width={44} tickFormatter={(v) => compact(Number(v))} />
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={(value, name) => (
                <Row
                  label={`${String(flowConfig[name as keyof typeof flowConfig]?.label ?? name)} / mo`}
                  value={kr(Number(value))}
                />
              )}
            />
          }
        />
        <Line dataKey="income" stroke="var(--color-income)" strokeWidth={2} dot={false} isAnimationActive={false} />
        <Line dataKey="spent" stroke="var(--color-spent)" strokeWidth={2} dot={false} isAnimationActive={false} />
      </LineChart>
    </ChartContainer>
  )
}
