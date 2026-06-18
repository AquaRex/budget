"use client"

import { cn } from "@/lib/utils"
import { formatNumber } from "@/lib/format"
import { MONTHS_SHORT, type MonthPoint } from "@/lib/budget"

type Row = {
  label: string
  values: number[]
  total: number | null
  average: number
  strong?: boolean
}

export function SummaryTable({ data }: { data: MonthPoint[] }) {
  const income = data.map((d) => d.income)
  const expenses = data.map((d) => d.expenses)
  const net = data.map((d) => d.net)
  const balance = data.map((d) => d.balance)
  const sum = (a: number[]) => a.reduce((s, v) => s + v, 0)

  const rows: Row[] = [
    { label: "Income", values: income, total: sum(income), average: sum(income) / 12 },
    {
      label: "Expenses",
      values: expenses,
      total: sum(expenses),
      average: sum(expenses) / 12,
    },
    {
      label: "Net savings",
      values: net,
      total: sum(net),
      average: sum(net) / 12,
      strong: true,
    },
    {
      label: "Ending balance",
      values: balance,
      total: null,
      average: sum(balance) / 12,
      strong: true,
    },
  ]

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-muted/50 border-b">
            <th className="px-3 py-2 text-left font-medium" />
            {MONTHS_SHORT.map((m) => (
              <th
                key={m}
                className="text-muted-foreground px-2 py-2 text-right font-medium"
              >
                {m}
              </th>
            ))}
            <th className="text-muted-foreground px-3 py-2 text-right font-medium italic">
              Total
            </th>
            <th className="text-muted-foreground px-3 py-2 text-right font-medium italic">
              Avg
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className="border-b last:border-0">
              <td
                className={cn(
                  "px-3 py-1.5 whitespace-nowrap",
                  row.strong ? "font-semibold" : "font-medium",
                )}
              >
                {row.label}
              </td>
              {row.values.map((v, i) => (
                <td
                  key={i}
                  className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap"
                >
                  {formatNumber(v)}
                </td>
              ))}
              <td className="text-muted-foreground px-3 py-1.5 text-right tabular-nums whitespace-nowrap italic">
                {row.total === null ? "" : formatNumber(row.total)}
              </td>
              <td className="text-muted-foreground px-3 py-1.5 text-right tabular-nums whitespace-nowrap italic">
                {formatNumber(row.average)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
