"use client"

import type { MonthStat, PeriodSummary, SpendingPace } from "@/lib/stats/types"
import { MONTHS_LONG } from "@/lib/budget"
import { cn } from "@/lib/utils"
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  down,
  formatShortDate,
  kr,
  pct,
  signedKr,
  up,
} from "@/components/stats/display"

const tone = (v: number) => (v > 0 ? up : v < 0 ? down : "")

const STATUS_LABEL: Record<MonthStat["status"], string> = {
  complete: "",
  current: "in progress",
  partial: "partial",
  future: "upcoming",
  "no-data": "no data",
}

/** Twelve months of the year in figures, with totals and averages. */
export function YearTable({
  months,
  summary,
  includeIncomplete,
  onSelectMonth,
}: {
  months: MonthStat[]
  summary: PeriodSummary
  includeIncomplete: boolean
  onSelectMonth?: (month: number) => void
}) {
  return (
    <Table className="text-sm">
      <TableHeader>
        <TableRow>
          <TableHead>Month</TableHead>
          <TableHead className="text-right">Income</TableHead>
          <TableHead className="text-right">Spent</TableHead>
          <TableHead className="text-right">Net</TableHead>
          <TableHead className="text-right">Rate</TableHead>
          <TableHead className="hidden text-right sm:table-cell">
            Net saved
          </TableHead>
          <TableHead className="hidden text-right md:table-cell">
            Budget bills
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {months.map((m) => {
          const empty = m.status === "future" || m.status === "no-data"
          // Rows outside the totals are muted so the Total row visibly adds up.
          const counted =
            m.status === "complete" ||
            (includeIncomplete &&
              (m.status === "current" || m.status === "partial"))
          return (
            <TableRow
              key={m.month}
              onClick={
                onSelectMonth && !empty
                  ? () => onSelectMonth(m.month)
                  : undefined
              }
              className={cn(
                "tabular-nums",
                !counted && "text-muted-foreground",
                onSelectMonth && !empty && "cursor-pointer",
              )}
            >
              <TableCell className="font-medium">
                {MONTHS_LONG[m.month - 1]}
                {summary.monthsCounted > 1 &&
                  summary.bestMonth?.month === m.month && (
                    <span
                      className={cn(
                        "ml-2 text-[10px] font-semibold tracking-widest uppercase",
                        up,
                      )}
                    >
                      best
                    </span>
                  )}
                {summary.monthsCounted > 1 &&
                  summary.worstMonth?.month === m.month && (
                    <span
                      className={cn(
                        "ml-2 text-[10px] font-semibold tracking-widest uppercase",
                        down,
                      )}
                    >
                      weakest
                    </span>
                  )}
                {STATUS_LABEL[m.status] && (
                  <span className="text-muted-foreground ml-2 text-[10px] font-semibold tracking-widest uppercase">
                    {STATUS_LABEL[m.status]}
                  </span>
                )}
              </TableCell>
              <TableCell className="text-right">
                {empty ? "—" : kr(m.income)}
              </TableCell>
              <TableCell className="text-right">
                {empty ? "—" : kr(m.spent)}
              </TableCell>
              <TableCell
                className={cn("text-right font-medium", counted && tone(m.net))}
              >
                {empty ? "—" : signedKr(m.net)}
              </TableCell>
              <TableCell
                className={cn(
                  "text-right",
                  m.status === "complete" && m.savingsRate != null
                    ? tone(m.savingsRate)
                    : "text-muted-foreground",
                )}
              >
                {empty ? "—" : pct(m.savingsRate)}
              </TableCell>
              <TableCell className="hidden text-right sm:table-cell">
                {empty ? "—" : signedKr(m.cumulativeNet)}
              </TableCell>
              <TableCell className="text-muted-foreground hidden text-right md:table-cell">
                {kr(m.budgetBills)}
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
      <TableFooter className="tabular-nums">
        <TableRow>
          <TableCell className="font-semibold">
            {includeIncomplete ? "Total" : "Total (completed months)"}
          </TableCell>
          <TableCell className="text-right font-semibold">
            {kr(summary.income)}
          </TableCell>
          <TableCell className="text-right font-semibold">
            {kr(summary.spent)}
          </TableCell>
          <TableCell
            className={cn("text-right font-semibold", tone(summary.net))}
          >
            {signedKr(summary.net)}
          </TableCell>
          <TableCell className="text-right font-semibold">
            {pct(summary.savingsRate)}
          </TableCell>
          <TableCell className="hidden sm:table-cell" />
          <TableCell className="text-muted-foreground hidden text-right md:table-cell">
            {kr(summary.budgetBills)}
          </TableCell>
        </TableRow>
        <TableRow>
          <TableCell className="text-muted-foreground">
            Average · {summary.monthsCounted} mo
          </TableCell>
          <TableCell className="text-right">
            {kr(summary.avgMonthlyIncome)}
          </TableCell>
          <TableCell className="text-right">
            {kr(summary.avgMonthlySpent)}
          </TableCell>
          <TableCell
            className={cn(
              "text-right",
              tone(summary.avgMonthlyIncome - summary.avgMonthlySpent),
            )}
          >
            {signedKr(summary.avgMonthlyIncome - summary.avgMonthlySpent)}
          </TableCell>
          <TableCell className="text-right">
            {pct(summary.avgSavingsRate)}
          </TableCell>
          <TableCell className="hidden sm:table-cell" />
          <TableCell className="hidden md:table-cell" />
        </TableRow>
      </TableFooter>
    </Table>
  )
}

/** The focused month in figures: actuals, budget and pace side by side. */
export function MonthFigures({
  month,
  summary,
  pace,
  coveredDays,
}: {
  month: MonthStat
  summary: PeriodSummary
  pace: SpendingPace
  coveredDays: number
}) {
  const vsBudget = summary.budgetBills - summary.spent
  // A partly imported month can't be judged against a full month's budget.
  const budgetRow =
    month.status === "complete"
      ? {
          label: vsBudget >= 0 ? "Under budget" : "Over budget",
          value: kr(Math.abs(vsBudget)),
          className: tone(vsBudget),
        }
      : {
          label: "Budget used",
          value:
            summary.budgetBills > 0
              ? pct(summary.spent / summary.budgetBills)
              : "—",
          hint: `${kr(summary.spent)} of ${kr(summary.budgetBills)}`,
        }
  const rows = [
    {
      label: "Income received",
      value: kr(summary.income),
      className: up,
      hint: `budget ${kr(summary.budgetIncome)}`,
    },
    {
      label: "Spent",
      value: kr(summary.spent),
      hint: `budget ${kr(summary.budgetBills)}`,
    },
    {
      label: "Net",
      value: signedKr(summary.net),
      className: tone(summary.net),
    },
    month.status === "current"
      ? {
          label: "Savings rate",
          value: pct(summary.savingsRate),
          className: "text-muted-foreground",
          hint: "so far · month in progress",
        }
      : {
          label: "Savings rate",
          value: pct(summary.savingsRate),
          className:
            summary.savingsRate != null ? tone(summary.savingsRate) : "",
        },
    budgetRow,
    {
      label: "Spent per day",
      value: coveredDays ? kr(summary.spent / coveredDays) : "—",
      hint: `over ${coveredDays} imported days`,
    },
    {
      label: "Typical month",
      value: kr(pace.avgFullMonth),
      hint: `${pace.lookbackMonths} complete months`,
    },
    { label: "Transactions", value: String(month.txCount) },
  ]

  return (
    <dl className="grid grid-cols-2 border-t border-l sm:grid-cols-3 lg:grid-cols-5">
      {rows.map((r) => (
        <div
          key={r.label}
          className="bg-card flex flex-col gap-0.5 border-r border-b p-3"
        >
          <dt className="text-muted-foreground text-[10px] font-semibold tracking-widest uppercase">
            {r.label}
          </dt>
          <dd className={cn("text-lg font-semibold tabular-nums", r.className)}>
            {r.value}
          </dd>
          {r.hint && (
            <dd className="text-muted-foreground text-[11px] tabular-nums">
              {r.hint}
            </dd>
          )}
        </div>
      ))}
    </dl>
  )
}

/** "Data through 18 Oct" — how fresh the imported bank data is. */
export function DataThrough({
  dataThrough,
  today,
}: {
  dataThrough: string | null
  today: string
}) {
  if (!dataThrough) {
    return (
      <span className="text-muted-foreground text-[11px]">
        No bank data yet
      </span>
    )
  }
  const stale = (Date.parse(today) - Date.parse(dataThrough)) / 86_400_000 > 3
  return (
    <span className="text-muted-foreground flex items-center gap-1.5 text-[11px] whitespace-nowrap">
      <span
        className={cn(
          "size-1.5 rounded-full",
          stale ? "bg-amber-500" : "bg-emerald-500",
        )}
        aria-hidden
      />
      Data through {formatShortDate(dataThrough)}
      {stale && <span className="sr-only">(more than 3 days old)</span>}
    </span>
  )
}
