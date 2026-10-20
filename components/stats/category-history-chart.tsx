"use client"

import {
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceArea,
  XAxis,
  YAxis,
} from "recharts"

import type { CategoryHistory } from "@/lib/stats/types"
import { MONTHS_SHORT } from "@/lib/budget"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import {
  OTHER_KEY,
  compact,
  kr,
  type CategoryPalette,
} from "@/components/stats/display"

/** Monthly spending stacked by category for the year (top categories + Other). */
export function CategoryHistoryChart({
  history,
  palette,
  focusMonth,
  height = 260,
}: {
  history: CategoryHistory
  palette: CategoryPalette
  focusMonth?: number
  height?: number
}) {
  const named = new Set(palette.keys.filter((k) => k !== OTHER_KEY))
  const data = history.months.map((m) => {
    const row: Record<string, number | string> = {
      label: MONTHS_SHORT[m.month - 1],
    }
    let other = 0
    for (const [k, v] of Object.entries(m.values)) {
      // Refunds can net a category negative; stacks only show money out.
      if (named.has(k)) {
        row[k] = Math.max(0, v)
      } else {
        other += Math.max(0, v)
      }
    }
    if (palette.keys.includes(OTHER_KEY)) {
      row[OTHER_KEY] = other
    }
    return row
  })
  const config: ChartConfig = Object.fromEntries(
    palette.keys.map((k) => [
      k,
      {
        label: palette.names[k] ?? "Uncategorised",
        color:
          k === OTHER_KEY
            ? "var(--viz-other)"
            : palette.color(k === "none" ? null : k),
      },
    ]),
  )
  const focusLabel = focusMonth ? MONTHS_SHORT[focusMonth - 1] : null

  if (palette.keys.length === 0) {
    return (
      <p className="text-muted-foreground py-8 text-center text-sm">
        No categorised spending this year.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <ChartContainer
        config={config}
        style={{ height }}
        className="aspect-auto w-full"
      >
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
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
          <ChartTooltip
            content={
              <ChartTooltipContent
                formatter={(value, name, item) => (
                  <div className="flex w-full items-center justify-between gap-3">
                    <span className="flex items-center gap-1.5">
                      <span
                        className="size-2.5 shrink-0"
                        style={{ background: item.color }}
                      />
                      <span className="text-muted-foreground">
                        {config[String(name)]?.label ?? name}
                      </span>
                    </span>
                    <span className="font-medium tabular-nums">
                      {kr(Number(value))}
                    </span>
                  </div>
                )}
              />
            }
          />
          {palette.keys.map((k, i) => (
            <Bar
              key={k}
              dataKey={k}
              stackId="spend"
              fill={`var(--color-${k})`}
              stroke="var(--card)"
              strokeWidth={1}
              maxBarSize={28}
              radius={i === palette.keys.length - 1 ? [2, 2, 0, 0] : 0}
              animationDuration={500}
            />
          ))}
        </BarChart>
      </ChartContainer>
      <div className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 pl-10 text-[11px]">
        {palette.keys.map((k) => (
          <span key={k} className="flex items-center gap-1.5">
            <span
              className="size-2.5"
              style={{ background: config[k].color }}
            />
            {config[k].label}
          </span>
        ))}
      </div>
    </div>
  )
}
