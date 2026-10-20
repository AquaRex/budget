"use client"

import { useId } from "react"
import {
  Area,
  AreaChart,
  CartesianGrid,
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
import { compact, signedKr } from "@/components/stats/display"

const config: ChartConfig = {
  cumulativeNet: { label: "Net saved", color: "var(--viz-income)" },
}

/** Running net (income − spent) from January: the wealth-building line. */
export function WealthChart({
  months,
  height = 220,
  sparkline = false,
}: {
  months: MonthStat[]
  height?: number
  sparkline?: boolean
}) {
  const fillId = `wealth-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`
  const data = months.map((m) => ({
    label: MONTHS_SHORT[m.month - 1],
    cumulativeNet:
      m.status === "future" || m.status === "no-data" ? null : m.cumulativeNet,
  }))
  const last =
    [...data].reverse().find((d) => d.cumulativeNet != null)?.cumulativeNet ?? 0
  const color = last >= 0 ? "var(--viz-income)" : "var(--viz-spent)"

  return (
    <ChartContainer
      config={config}
      style={{ height }}
      className="aspect-auto w-full"
    >
      <AreaChart
        data={data}
        margin={
          sparkline
            ? { top: 4, right: 4, bottom: 4, left: 4 }
            : { top: 8, right: 8, bottom: 0, left: 0 }
        }
      >
        <defs>
          <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.25} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        {!sparkline && <CartesianGrid vertical={false} />}
        <XAxis
          dataKey="label"
          hide={sparkline}
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          interval={0}
          fontSize={10}
        />
        <YAxis
          hide={sparkline}
          tickLine={false}
          axisLine={false}
          width={40}
          tickFormatter={(v) => compact(Number(v))}
        />
        <ReferenceLine y={0} stroke="var(--border)" />
        {!sparkline && (
          <ChartTooltip
            content={
              <ChartTooltipContent
                hideIndicator
                formatter={(value) => (
                  <div className="flex w-full justify-between gap-3">
                    <span className="text-muted-foreground">Net saved</span>
                    <span className="font-medium tabular-nums">
                      {signedKr(Number(value))}
                    </span>
                  </div>
                )}
              />
            }
          />
        )}
        <Area
          dataKey="cumulativeNet"
          stroke={color}
          strokeWidth={2}
          fill={`url(#${fillId})`}
          connectNulls={false}
          dot={
            sparkline
              ? false
              : { r: 3, strokeWidth: 2, stroke: "var(--card)", fill: color }
          }
          activeDot={
            sparkline ? false : { r: 5, strokeWidth: 2, stroke: "var(--card)" }
          }
          animationDuration={600}
        />
      </AreaChart>
    </ChartContainer>
  )
}
