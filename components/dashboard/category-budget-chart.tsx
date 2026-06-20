"use client"

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"

import { formatNOK } from "@/lib/format"
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"

const config: ChartConfig = {
  budget: { label: "Budgeted", color: "var(--muted-foreground)" },
  spent: { label: "Spent", color: "#f43f5e" },
}

export type CategoryCompare = {
  category: string
  budget: number
  spent: number
}

export function CategoryBudgetChart({ data }: { data: CategoryCompare[] }) {
  const height = Math.max(160, data.length * 46 + 40)
  return (
    <ChartContainer config={config} style={{ height }} className="w-full">
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 4, right: 12, bottom: 0, left: 4 }}
        barGap={2}
      >
        <CartesianGrid horizontal={false} strokeDasharray="3 3" />
        <XAxis
          type="number"
          tickLine={false}
          axisLine={false}
          fontSize={11}
          tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`}
        />
        <YAxis
          type="category"
          dataKey="category"
          tickLine={false}
          axisLine={false}
          width={110}
          fontSize={11}
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
        <Bar dataKey="budget" fill="var(--color-budget)" radius={3} />
        <Bar dataKey="spent" fill="var(--color-spent)" radius={3} />
        <ChartLegend content={<ChartLegendContent />} />
      </BarChart>
    </ChartContainer>
  )
}
