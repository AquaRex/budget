"use client"

import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts"

import { formatNOK, formatNumber } from "@/lib/format"
import type { MonthPoint } from "@/lib/budget"
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"

const config: ChartConfig = {
  income: { label: "Income", color: "#10b981" },
  expenses: { label: "Expenses", color: "#f43f5e" },
  balance: { label: "Ending balance", color: "var(--muted-foreground)" },
}

export function BalanceChart({
  data,
  height = 280,
  compact = false,
  highlightMonth,
}: {
  data: MonthPoint[]
  height?: number
  compact?: boolean
  /** 1-12; draws a marker line on that month. */
  highlightMonth?: number
}) {
  return (
    <ChartContainer config={config} style={{ height }} className="w-full">
      <ComposedChart
        data={data}
        margin={{ top: 8, right: 8, bottom: 0, left: compact ? -16 : 0 }}
      >
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis
          dataKey="month"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          fontSize={11}
          interval={compact ? 1 : 0}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={compact ? 28 : 44}
          fontSize={11}
          tickFormatter={(v) =>
            compact ? `${Math.round(Number(v) / 1000)}k` : formatNumber(Number(v))
          }
        />
        {highlightMonth && (
          <ReferenceLine
            x={data[highlightMonth - 1]?.month}
            stroke="var(--border)"
            strokeDasharray="4 4"
          />
        )}
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={(value, name) => (
                <div className="flex w-full justify-between gap-3">
                  <span className="text-muted-foreground capitalize">
                    {config[name as keyof typeof config]?.label ?? name}
                  </span>
                  <span className="font-medium tabular-nums">
                    {formatNOK(Number(value))}
                  </span>
                </div>
              )}
            />
          }
        />
        <Area
          dataKey="balance"
          stroke="var(--color-balance)"
          fill="var(--color-balance)"
          fillOpacity={0.08}
          strokeWidth={2}
          dot={false}
        />
        <Line
          dataKey="income"
          stroke="var(--color-income)"
          strokeWidth={2}
          dot={false}
        />
        <Line
          dataKey="expenses"
          stroke="var(--color-expenses)"
          strokeWidth={2}
          dot={false}
        />
        {!compact && <ChartLegend content={<ChartLegendContent />} />}
      </ComposedChart>
    </ChartContainer>
  )
}
