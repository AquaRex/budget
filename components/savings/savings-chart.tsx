"use client"

import { useId } from "react"
import { Area, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from "recharts"

import type { SavingsSeriesPoint } from "@/lib/savings/types"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { compact, kr } from "@/components/stats/display"
import { monthLabel } from "@/components/savings/format"

const config: ChartConfig = {
  value: { label: "Worth", color: "var(--viz-income)" },
  invested: { label: "Put in", color: "var(--viz-baseline)" },
}

/** Worth (green area) against money put in (dashed step line), month by month. */
export function SavingsChart({ points, height = 280 }: { points: SavingsSeriesPoint[]; height?: number }) {
  const fillId = `savings-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`
  const data = points.map((p) => ({
    label: monthLabel(p.monthIndex),
    value: Math.round(p.value),
    invested: Math.round(p.invested),
  }))
  if (data.length < 2) {
    return (
      <p className="text-muted-foreground py-8 text-center text-sm">
        The chart fills in once you have two or more months of holdings.
      </p>
    )
  }
  return (
    <ChartContainer config={config} style={{ height }} className="aspect-auto w-full">
      <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--viz-income)" stopOpacity={0.3} />
            <stop offset="100%" stopColor="var(--viz-income)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} fontSize={10} />
        <YAxis tickLine={false} axisLine={false} width={44} tickFormatter={(v) => compact(Number(v))} />
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={(value, name) => (
                <div className="flex w-full justify-between gap-3">
                  <span className="text-muted-foreground">{config[name as keyof typeof config]?.label}</span>
                  <span className="font-medium tabular-nums">{kr(Number(value))}</span>
                </div>
              )}
            />
          }
        />
        <Area dataKey="value" stroke="var(--viz-income)" strokeWidth={2} fill={`url(#${fillId})`} animationDuration={600} />
        <Line
          dataKey="invested"
          stroke="var(--viz-baseline)"
          strokeWidth={2}
          strokeDasharray="4 4"
          dot={false}
          type="stepAfter"
          animationDuration={600}
        />
      </ComposedChart>
    </ChartContainer>
  )
}

/** One holding's months up to today as a series point list. */
export function holdingPoints(
  months: { monthIndex: number; paid: number; received: number; value: number }[],
  todayIndex: number,
): SavingsSeriesPoint[] {
  return months
    .filter((m) => m.monthIndex <= todayIndex)
    .map((m) => ({
      monthIndex: m.monthIndex,
      paid: m.paid,
      received: m.received,
      invested: m.paid - m.received,
      value: m.value,
      gain: m.value + m.received - m.paid,
    }))
}
