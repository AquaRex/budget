"use client"

import { useMemo } from "react"
import { Label, Pie, PieChart } from "recharts"

import type { Entry } from "@/lib/types"
import { categoryColor } from "@/lib/categories"
import { formatNOK } from "@/lib/format"
import { effectiveAmount, type BudgetContext } from "@/lib/budget"
import { useCategories } from "@/lib/data/use-budget"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"

export function CategoryDonut({
  bills,
  ctx,
  month,
}: {
  bills: Entry[]
  ctx: BudgetContext
  month: number
}) {
  const { categories } = useCategories("bill")
  const { data, total } = useMemo(() => {
    const nameOf = (id: string | null) =>
      categories.find((c) => c.id === id)?.name ?? "Uncategorized"
    const byCat = new Map<string, number>()
    for (const b of bills) {
      if (!b.is_active) continue
      const amount = effectiveAmount(b, ctx, month)
      if (amount <= 0) continue
      const cat = nameOf(b.category_id)
      byCat.set(cat, (byCat.get(cat) ?? 0) + amount)
    }
    const data = Array.from(byCat.entries())
      .map(([category, amount]) => ({
        category,
        amount,
        fill: categoryColor(category),
      }))
      .sort((a, b) => b.amount - a.amount)
    const total = data.reduce((s, d) => s + d.amount, 0)
    return { data, total }
  }, [bills, ctx, month, categories])

  const config: ChartConfig = Object.fromEntries(
    data.map((d) => [d.category, { label: d.category, color: d.fill }]),
  )

  return (
    <Card className="flex flex-col">
      <CardHeader>
        <CardTitle>Spending by category</CardTitle>
        <CardDescription>Active bills this month</CardDescription>
      </CardHeader>
      <CardContent className="flex-1 pb-0">
        {data.length === 0 ? (
          <div className="text-muted-foreground flex h-[240px] items-center justify-center text-sm">
            No bills this month.
          </div>
        ) : (
          <ChartContainer
            config={config}
            className="mx-auto aspect-square max-h-[240px]"
          >
            <PieChart>
              <ChartTooltip
                cursor={false}
                content={
                  <ChartTooltipContent
                    hideLabel
                    formatter={(value, name) => (
                      <div className="flex w-full justify-between gap-3">
                        <span className="text-muted-foreground">{name}</span>
                        <span className="font-medium tabular-nums">
                          {formatNOK(Number(value))}
                        </span>
                      </div>
                    )}
                  />
                }
              />
              <Pie
                data={data}
                dataKey="amount"
                nameKey="category"
                innerRadius={60}
                strokeWidth={4}
              >
                <Label
                  content={({ viewBox }) => {
                    if (!viewBox || !("cx" in viewBox)) return null
                    return (
                      <text
                        x={viewBox.cx}
                        y={viewBox.cy}
                        textAnchor="middle"
                        dominantBaseline="middle"
                      >
                        <tspan
                          x={viewBox.cx}
                          y={viewBox.cy}
                          className="fill-foreground text-lg font-semibold"
                        >
                          {formatNOK(total)}
                        </tspan>
                        <tspan
                          x={viewBox.cx}
                          y={(viewBox.cy ?? 0) + 20}
                          className="fill-muted-foreground text-xs"
                        >
                          this month
                        </tspan>
                      </text>
                    )
                  }}
                />
              </Pie>
            </PieChart>
          </ChartContainer>
        )}
      </CardContent>
      {data.length > 0 && (
        <CardContent className="pt-4">
          <ul className="flex flex-col gap-2">
            {data.map((d) => (
              <li key={d.category} className="flex items-center gap-2 text-sm">
                <span
                  className="size-3 rounded-sm"
                  style={{ backgroundColor: d.fill }}
                />
                <span className="text-muted-foreground flex-1">
                  {d.category}
                </span>
                <span className="font-medium tabular-nums">
                  {formatNOK(d.amount)}
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      )}
    </Card>
  )
}
