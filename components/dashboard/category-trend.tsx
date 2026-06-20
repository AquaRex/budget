"use client"

import { useState } from "react"
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
} from "recharts"

import { formatNOK, formatNumber } from "@/lib/format"
import { cn } from "@/lib/utils"
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"

const config: ChartConfig = {
  budgeted: { label: "Budgeted", color: "var(--muted-foreground)" },
  spent: { label: "Spent", color: "#f43f5e" },
}

export type CatTrend = {
  id: string
  name: string
  totalBudget: number
  totalSpent: number
  points: { month: string; budgeted: number; spent: number }[]
}

export function CategoryTrend({
  trends,
  onMonthClick,
}: {
  trends: CatTrend[]
  /** Click a month on the chart: (categoryId, monthIndex 0-11). */
  onMonthClick?: (categoryId: string, monthIndex: number) => void
}) {
  const [activeId, setActiveId] = useState(trends[0]?.id)
  const active = trends.find((t) => t.id === activeId) ?? trends[0]
  if (!active) return null

  return (
    <div className="flex flex-col gap-4 sm:flex-row">
      <div className="flex max-h-[300px] shrink-0 flex-col gap-0.5 overflow-y-auto sm:w-56">
        {trends.map((t) => (
          <button
            key={t.id}
            type="button"
            onMouseEnter={() => setActiveId(t.id)}
            onFocus={() => setActiveId(t.id)}
            onClick={() => setActiveId(t.id)}
            className={cn(
              "rounded-md px-3 py-1 text-left transition-colors",
              t.id === active.id ? "bg-muted" : "hover:bg-muted/60",
            )}
          >
            <div className="truncate text-sm font-medium">{t.name}</div>
            <div className="text-muted-foreground text-[11px] tabular-nums">
              {formatNOK(t.totalSpent)} / {formatNOK(t.totalBudget)}
            </div>
          </button>
        ))}
      </div>

      <div className="min-w-0 flex-1">
        <ChartContainer config={config} style={{ height: 300 }} className="w-full">
          <ComposedChart
            data={active.points}
            margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
            className={onMonthClick ? "cursor-pointer" : undefined}
            onClick={(state) => {
              if (!onMonthClick) return
              const idx = Number(
                (state as { activeTooltipIndex?: number | string })
                  .activeTooltipIndex,
              )
              if (Number.isInteger(idx)) onMonthClick(active.id, idx)
            }}
          >
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis
              dataKey="month"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              fontSize={11}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={44}
              fontSize={11}
              tickFormatter={(v) => formatNumber(Number(v))}
            />
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
            <Line
              dataKey="budgeted"
              stroke="var(--color-budgeted)"
              strokeWidth={2}
              strokeDasharray="4 4"
              dot={false}
              animationDuration={250}
            />
            <Area
              dataKey="spent"
              stroke="var(--color-spent)"
              fill="var(--color-spent)"
              fillOpacity={0.15}
              strokeWidth={2}
              dot={false}
              animationDuration={250}
            />
            <ChartLegend content={<ChartLegendContent />} />
          </ComposedChart>
        </ChartContainer>
      </div>
    </div>
  )
}
