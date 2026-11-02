"use client"

import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts"

import type { Loan } from "@/lib/data/loans"
import type { LoanProjection } from "@/lib/loans/compute"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { Figure } from "@/components/stats/figure"
import { compact, kr } from "@/components/stats/display"
import { monthLabel } from "@/components/savings/format"
import { percent } from "@/components/loans/loan-card"

const round = (n: number) => kr(Math.round(n))
const COLORS = [1, 2, 3, 4, 5, 7, 8].map((n) => `var(--viz-cat-${n})`)

type Item = { loan: Loan; projection: LoanProjection }

/** What a loan owes at the end of a month: 0 before it's tracked and once it's paid off. */
function owedAt(p: LoanProjection, monthIndex: number) {
  const first = p.months[0]?.monthIndex
  const last = p.months.at(-1)
  if (first === undefined || !last || monthIndex < first) {
    return 0
  }
  if (monthIndex > last.monthIndex) {
    return p.payoff === null ? Math.max(0, last.balance) : 0
  }
  return Math.max(0, p.months[monthIndex - first].balance)
}

/** All loans together: what's owed, how much is paid down, when you're debt-free. */
export function LoansSummary({
  items,
  todayIndex,
}: {
  items: Item[]
  todayIndex: number
}) {
  const projections = items.map((i) => i.projection)
  const sum = (f: (p: LoanProjection) => number) =>
    projections.reduce((s, p) => s + f(p), 0)
  const owed = sum((p) => Math.max(0, p.balanceNow))
  const first = sum((p) => p.firstBalance)
  const paidDown = sum((p) => Math.max(0, p.principalSoFar))
  const payment = sum((p) => (p.balanceNow > 0 ? p.payment : 0))
  const interestLeft = sum((p) => (p.balanceNow > 0 ? p.interestLeft : 0))
  const open = projections.filter((p) => p.balanceNow > 0)
  const neverPaid = open.some((p) => p.payoff === null)
  const debtFree = open.length
    ? Math.max(...open.map((p) => p.payoff ?? 0))
    : null
  const yearsLeft =
    debtFree === null ? 0 : Math.max(0, debtFree - todayIndex) / 12

  return (
    <div className="flex flex-col gap-4 border p-4">
      <h2 className="text-sm font-semibold">All loans</h2>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Figure
          label="Debt-free"
          value={
            neverPaid
              ? "Never"
              : debtFree === null
                ? "Now"
                : monthLabel(debtFree)
          }
          hint={
            neverPaid
              ? "a loan's payment doesn't cover its interest"
              : debtFree === null
                ? "nothing left to pay"
                : `in ${yearsLeft.toLocaleString("nb-NO", { maximumFractionDigits: 1 })} years`
          }
          bad={neverPaid}
        />
        <Figure
          label="Owed in total"
          value={round(owed)}
          hint={`across ${items.length} loan${items.length === 1 ? "" : "s"}`}
        />
        <Figure
          label="Paid down"
          value={percent(first > 0 ? (paidDown / first) * 100 : 0)}
          hint={`${round(paidDown)} of ${round(first)}`}
        />
        <Figure
          label="Monthly payments"
          value={round(payment)}
          hint={
            neverPaid
              ? "interest to come can't be told"
              : `${round(interestLeft)} interest still to come`
          }
        />
      </div>
      <OwedChart
        items={items}
        todayIndex={todayIndex}
        debtFree={neverPaid ? null : debtFree}
      />
    </div>
  )
}

function OwedChart({
  items,
  todayIndex,
  debtFree,
}: {
  items: Item[]
  todayIndex: number
  debtFree: number | null
}) {
  const tracked = items.filter((i) => i.projection.months.length > 0)
  if (!tracked.length) {
    return null
  }
  const from = Math.min(
    ...tracked.map((i) => i.projection.months[0].monthIndex),
  )
  const to = Math.max(
    ...tracked.map((i) => i.projection.months.at(-1)!.monthIndex),
  )
  const config: ChartConfig = Object.fromEntries(
    tracked.map((i, n) => [
      i.loan.id,
      { label: i.loan.name, color: COLORS[n % COLORS.length] },
    ]),
  )
  const data = Array.from({ length: to - from + 1 }, (_, k) => {
    const monthIndex = from + k
    return {
      label: monthLabel(monthIndex),
      ...Object.fromEntries(
        tracked.map((i) => [
          i.loan.id,
          Math.round(owedAt(i.projection, monthIndex)),
        ]),
      ),
    }
  })
  const today = monthLabel(todayIndex)
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-semibold">Owed over time</h3>
        <span className="text-muted-foreground text-[11px]">
          after Today = projected
        </span>
      </div>
      <ChartContainer
        config={config}
        style={{ height: 260 }}
        className="aspect-auto w-full"
      >
        <AreaChart
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
                      {config[String(name)]?.label}
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
          {debtFree !== null && debtFree > todayIndex && (
            <ReferenceLine
              x={monthLabel(debtFree)}
              stroke="var(--muted-foreground)"
              strokeDasharray="2 3"
              label={{
                value: "Debt-free",
                position: "insideTopRight",
                fontSize: 10,
                fill: "var(--muted-foreground)",
              }}
            />
          )}
          {tracked.map((i) => (
            <Area
              key={i.loan.id}
              dataKey={i.loan.id}
              stackId="owed"
              type="linear"
              stroke={config[i.loan.id].color}
              fill={config[i.loan.id].color}
              fillOpacity={0.3}
              strokeWidth={2}
              dot={false}
            />
          ))}
        </AreaChart>
      </ChartContainer>
      <ul className="grid grid-cols-1 gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
        {tracked.map((i) => {
          const p = i.projection
          return (
            <li key={i.loan.id} className="flex items-center gap-2">
              <span
                className="size-2.5 shrink-0"
                style={{ background: config[i.loan.id].color }}
              />
              <span className="min-w-0 flex-1 truncate">{i.loan.name}</span>
              <span className="font-medium tabular-nums">
                {round(Math.max(0, p.balanceNow))}
              </span>
              <span className="text-muted-foreground shrink-0 whitespace-nowrap tabular-nums">
                {p.balanceNow <= 0
                  ? "paid off"
                  : p.payoff === null
                    ? "never paid off"
                    : `paid off ${monthLabel(p.payoff)}`}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
