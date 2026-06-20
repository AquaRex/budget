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
  return (
    <ChartContainer config={config} style={{ height: 360 }} className="w-full">
      <BarChart
        data={data}
        margin={{ top: 4, right: 4, bottom: 0, left: 0 }}
        barGap={2}
      >
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis
          dataKey="category"
          tickLine={false}
          axisLine={false}
          fontSize={10}
          interval={0}
          angle={-30}
          textAnchor="end"
          height={64}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={40}
          fontSize={11}
          tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`}
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
