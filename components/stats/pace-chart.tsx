"use client"

import { useId } from "react"
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts"

import type { SpendingPace } from "@/lib/stats/types"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { compact, kr } from "@/components/stats/display"

const config: ChartConfig = {
  current: { label: "This month", color: "var(--primary)" },
  projected: { label: "Projected", color: "var(--primary)" },
  average: { label: "Typical month", color: "var(--viz-baseline)" },
}

/** Cumulative spend this month vs the typical month, with a projection to month end. */
export function PaceChart({
  pace,
  height = 240,
}: {
  pace: SpendingPace
  height?: number
}) {
  const fillId = `pace-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`
  const today = pace.dayOfMonth
  const projecting =
    today > 0 && today < pace.daysInMonth && pace.lookbackMonths > 0
  const span = pace.daysInMonth - today
  const data = pace.curve.map((p) => ({
    ...p,
    projected:
      projecting && p.day >= today
        ? pace.spentToDate +
          ((pace.projected - pace.spentToDate) * (p.day - today)) / span
        : null,
  }))

  return (
    <div className="flex flex-col gap-2">
      <ChartContainer
        config={config}
        style={{ height }}
        className="aspect-auto w-full"
      >
        <ComposedChart
          data={data}
          margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
        >
          <defs>
            <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="0%"
                stopColor="var(--color-current)"
                stopOpacity={0.22}
              />
              <stop
                offset="100%"
                stopColor="var(--color-current)"
                stopOpacity={0}
              />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="day"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            interval="preserveStartEnd"
            minTickGap={16}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={36}
            tickFormatter={(v) => compact(Number(v))}
          />
          {projecting && (
            <ReferenceLine
              x={today}
              stroke="var(--border)"
              label={{
                value: "data through",
                position: "insideTopLeft",
                fontSize: 10,
                fill: "var(--muted-foreground)",
              }}
            />
          )}
          <ChartTooltip
            content={
              <ChartTooltipContent
                labelFormatter={(_, payload) =>
                  `Day ${payload?.[0]?.payload?.day ?? ""}`
                }
                formatter={(value, name) => (
                  <div className="flex w-full justify-between gap-3">
                    <span className="text-muted-foreground">
                      {config[name as keyof typeof config]?.label ?? name}
                    </span>
                    <span className="font-medium tabular-nums">
                      {kr(Number(value))}
                    </span>
                  </div>
                )}
              />
            }
          />
          <Line
            dataKey="average"
            stroke="var(--color-average)"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
          <Area
            dataKey="current"
            stroke="var(--color-current)"
            strokeWidth={2}
            fill={`url(#${fillId})`}
            dot={false}
            connectNulls={false}
            animationDuration={600}
          />
          {projecting && (
            <Line
              dataKey="projected"
              stroke="var(--color-projected)"
              strokeWidth={2}
              strokeDasharray="4 4"
              strokeOpacity={0.6}
              dot={false}
              isAnimationActive={false}
            />
          )}
        </ComposedChart>
      </ChartContainer>
      <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]">
        <span className="flex items-center gap-1.5">
          <span className="bg-primary h-0.5 w-4" /> This month
        </span>
        {projecting && (
          <span className="flex items-center gap-1.5">
            <span className="border-primary/60 h-0 w-4 border-t-2 border-dashed" />{" "}
            Projected
          </span>
        )}
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-4 bg-(--viz-baseline)" /> Typical (avg of{" "}
          {pace.lookbackMonths} mo)
        </span>
      </div>
    </div>
  )
}
