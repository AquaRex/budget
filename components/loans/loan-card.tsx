"use client"

import { Pencil, Trash2 } from "lucide-react"
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts"

import type { Loan } from "@/lib/data/loans"
import type { LoanProjection } from "@/lib/loans/compute"
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { Panel } from "@/components/stats/panel"
import { Figure } from "@/components/stats/figure"
import { compact, kr } from "@/components/stats/display"
import { monthLabel } from "@/components/savings/format"

const round = (n: number) => kr(Math.round(n))

export function LoanCard({
  loan,
  categoryName,
  projection: p,
  todayIndex,
  onEdit,
  onDelete,
}: {
  loan: Loan
  categoryName: string | null
  projection: LoanProjection
  todayIndex: number
  onEdit: () => void
  onDelete: () => void
}) {
  const paidOff = p.balanceNow <= 0
  const yearsLeft =
    p.payoff === null ? null : Math.max(0, p.payoff - todayIndex) / 12

  return (
    <Panel
      title={loan.name}
      subtitle={`${loan.interest_pct.toLocaleString("nb-NO")} % · paid from ${categoryName ?? "no category"} · ${round(loan.balance)} owed at the start of ${monthLabel(loan.start_year * 12 + loan.start_month - 1)}`}
      action={
        <div className="flex items-center">
          <button
            type="button"
            aria-label={`Edit ${loan.name}`}
            onClick={onEdit}
            className="text-muted-foreground hover:text-foreground p-1.5"
          >
            <Pencil className="size-4" />
          </button>
          <button
            type="button"
            aria-label={`Delete ${loan.name}`}
            onClick={onDelete}
            className="text-muted-foreground hover:text-destructive p-1.5"
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <Figure
            label="Owed now"
            value={round(Math.max(0, p.balanceNow))}
            hint={`${round(p.principalSoFar)} paid down of ${round(p.firstBalance)} since ${monthLabel(p.firstIndex)}`}
            bad={p.principalSoFar < 0}
          />
          <Figure
            label="Paid off"
            value={
              paidOff
                ? "Done"
                : p.payoff === null
                  ? "Never"
                  : monthLabel(p.payoff)
            }
            hint={
              paidOff
                ? "nothing left to pay"
                : p.payoff === null
                  ? p.payment > 0
                    ? "the payment doesn't cover the interest"
                    : "no payments yet to project from"
                  : `in ${yearsLeft!.toLocaleString("nb-NO", { maximumFractionDigits: 1 })} years`
            }
            bad={!paidOff && p.payoff === null}
          />
          <Figure
            label="Monthly payment"
            value={round(p.payment)}
            hint={
              p.paymentFromPlan
                ? "as you set it"
                : "average of your latest payments"
            }
          />
          <Figure
            label="Paid so far"
            value={round(p.paidSoFar)}
            hint={`since ${monthLabel(p.firstIndex)}`}
          />
          <Figure
            label="Interest paid"
            value={round(p.interestSoFar)}
            hint="so far"
          />
          <Figure
            label="Interest to come"
            value={p.payoff === null && !paidOff ? "—" : round(p.interestLeft)}
            hint={
              p.payoff === null && !paidOff
                ? "can't tell until it's paid off"
                : `${round(p.interestSoFar + p.interestLeft)} in total`
            }
          />
        </div>
        {p.months.length > 1 && (
          <>
            <BalanceChart p={p} todayIndex={todayIndex} />
            <YearChart p={p} />
          </>
        )}
      </div>
    </Panel>
  )
}

const balanceConfig: ChartConfig = {
  actual: { label: "Owed", color: "var(--viz-cat-1)" },
  projected: { label: "Owed (projected)", color: "var(--viz-cat-1)" },
}

function BalanceChart({
  p,
  todayIndex,
}: {
  p: LoanProjection
  todayIndex: number
}) {
  const lastActual = p.months.filter((m) => !m.projected).at(-1)?.monthIndex
  const data = p.months.map((m) => ({
    label: monthLabel(m.monthIndex),
    actual: m.projected ? null : Math.round(Math.max(0, m.balance)),
    projected:
      m.projected || m.monthIndex === lastActual
        ? Math.round(Math.max(0, m.balance))
        : null,
  }))
  const today = monthLabel(todayIndex)
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-semibold">Amount owed</h3>
        <span className="text-muted-foreground text-[11px]">
          dashed = projected
        </span>
      </div>
      <ChartContainer
        config={balanceConfig}
        style={{ height: 240 }}
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
                      {balanceConfig[name as keyof typeof balanceConfig]?.label}
                    </span>
                    <span className="font-medium tabular-nums">
                      {kr(Number(value))}
                    </span>
                  </div>
                )}
              />
            }
          />
          {data.some((d) => d.label === today) && (
            <ReferenceLine
              x={today}
              stroke="var(--muted-foreground)"
              strokeDasharray="2 3"
              label={{
                value: "Today",
                position: "insideTopRight",
                fontSize: 10,
                fill: "var(--muted-foreground)",
              }}
            />
          )}
          <Area
            dataKey="actual"
            stroke="var(--viz-cat-1)"
            fill="var(--viz-cat-1)"
            fillOpacity={0.25}
            strokeWidth={2}
            dot={false}
            connectNulls={false}
          />
          <Area
            dataKey="projected"
            stroke="var(--viz-cat-1)"
            fill="var(--viz-cat-1)"
            fillOpacity={0.08}
            strokeWidth={2}
            strokeDasharray="5 4"
            dot={false}
            connectNulls={false}
          />
        </ComposedChart>
      </ChartContainer>
    </div>
  )
}

const yearConfig: ChartConfig = {
  principal: { label: "Paid down", color: "var(--viz-cat-1)" },
  interest: { label: "Interest", color: "var(--viz-cat-2)" },
}

function YearChart({ p }: { p: LoanProjection }) {
  const data = p.years.map((y) => ({
    label: String(y.year),
    principal: Math.round(Math.max(0, y.principal)),
    interest: Math.round(y.interest),
    projected: y.projected,
  }))
  return (
    <div className="flex flex-col gap-1">
      <h3 className="text-sm font-semibold">
        Where each year&apos;s payments go
      </h3>
      <ChartContainer
        config={yearConfig}
        style={{ height: 220 }}
        className="aspect-auto w-full"
      >
        <BarChart
          data={data}
          margin={{ top: 8, right: 12, bottom: 0, left: 0 }}
        >
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            minTickGap={16}
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
                formatter={(value, name, item) => (
                  <div className="flex w-full justify-between gap-3">
                    <span className="text-muted-foreground">
                      {yearConfig[name as keyof typeof yearConfig]?.label}
                      {item.payload.projected ? " (incl. projected)" : ""}
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
          <Bar
            dataKey="principal"
            stackId="y"
            fill="var(--viz-cat-1)"
            maxBarSize={28}
          >
            {data.map((d) => (
              <Cell key={d.label} fillOpacity={d.projected ? 0.45 : 1} />
            ))}
          </Bar>
          <Bar
            dataKey="interest"
            stackId="y"
            fill="var(--viz-cat-2)"
            radius={[4, 4, 0, 0]}
            maxBarSize={28}
          >
            {data.map((d) => (
              <Cell key={d.label} fillOpacity={d.projected ? 0.45 : 1} />
            ))}
          </Bar>
        </BarChart>
      </ChartContainer>
      <p className="text-muted-foreground text-xs">
        Faded years include projected months.
      </p>
    </div>
  )
}
