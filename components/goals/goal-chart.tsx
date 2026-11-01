"use client"

import {
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts"

import type { GoalProjection } from "@/lib/goals/compute"
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

const config: ChartConfig = {
  budget: { label: "On budget", color: "var(--viz-cat-1)" },
  actual: { label: "At your actual pace", color: "var(--viz-cat-2)" },
}

/** Both projected paths from today, against the goal amount and month. */
export function GoalChart({
  projection,
  height = 260,
}: {
  projection: GoalProjection
  height?: number
}) {
  const data = projection.points.map((p) => ({
    label: monthLabel(p.monthIndex),
    budget: Math.round(p.budget),
    actual: Math.round(p.actual),
  }))
  const deadline = monthLabel(projection.deadline)
  return (
    <ChartContainer
      config={config}
      style={{ height }}
      className="aspect-auto w-full"
    >
      <ComposedChart
        data={data}
        margin={{ top: 16, right: 12, bottom: 0, left: 0 }}
      >
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={32}
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
        <ReferenceLine
          y={projection.target}
          stroke="var(--foreground)"
          strokeDasharray="4 4"
          label={{
            value: "Goal",
            position: "insideTopLeft",
            fontSize: 10,
            fill: "var(--muted-foreground)",
          }}
        />
        {data.some((d) => d.label === deadline) && (
          <ReferenceLine
            x={deadline}
            stroke="var(--muted-foreground)"
            strokeDasharray="2 3"
            label={{
              value: deadline,
              position: "insideTopRight",
              fontSize: 10,
              fill: "var(--muted-foreground)",
            }}
          />
        )}
        <Line
          dataKey="budget"
          stroke="var(--viz-cat-1)"
          strokeWidth={2}
          dot={false}
          animationDuration={600}
        />
        <Line
          dataKey="actual"
          stroke="var(--viz-cat-2)"
          strokeWidth={2}
          dot={false}
          animationDuration={600}
        />
      </ComposedChart>
    </ChartContainer>
  )
}
