"use client"

import { Fragment, useMemo, useState } from "react"

import type { Category, Entry, Transaction } from "@/lib/types"
import type { BudgetContext } from "@/lib/budget"
import { MONTHS_SHORT, MONTHS_LONG, monthlySubtotals } from "@/lib/budget"
import { formatNumber, formatNOK } from "@/lib/format"
import { cn } from "@/lib/utils"
import {
  effectiveCategoryId,
  groupOfCategory,
  isSpending,
  isInternalTx,
  type TypeMap,
} from "@/lib/spending"
import { MonthCalendar, type CalEvent } from "@/components/calendar/month-calendar"

// Freeze the first column on ≥sm screens, like the other grids.
const sticky = "sm:sticky sm:left-0 sm:z-10"
const COLS = 15 // name + 12 months + total + avg

type ActualRow = { key: string; name: string; months: number[]; total: number }
type Band = {
  key: string
  name: string
  kind: "bill" | "income"
  budget: number[] // 12 monthly budgeted amounts (0s for the Unassigned band)
  hasBudget: boolean
  rows: ActualRow[] // one per bank type, actuals
  actual: number[] // 12 monthly actual totals
}

const zeros = () => Array(12).fill(0) as number[]
const sum = (a: number[]) => a.reduce((s, v) => s + v, 0)

export function GroupsGrid({
  transactions,
  groups,
  categories,
  typeMap,
  billEntries,
  incomeEntries,
  ctx,
  year,
}: {
  transactions: Transaction[]
  groups: Category[] // categories used by Bills/Income, in sort order
  categories: Category[] // the full pool (for category -> group resolution)
  typeMap: TypeMap
  billEntries: Entry[]
  incomeEntries: Entry[]
  ctx: BudgetContext
  year: string
}) {
  const bands = useMemo<Band[]>(() => {
    const inYear = transactions.filter(
      (t) => t.booked_date.slice(0, 4) === year,
    )
    const groupIds = new Set(groups.map((g) => g.id))
    const catById = new Map(categories.map((c) => [c.id, c]))

    // Actual rows (one per resolved category) for a group + sign convention.
    const rowsFor = (
      groupId: string | null,
      want: (t: Transaction) => boolean,
    ): { rows: ActualRow[]; totals: number[] } => {
      const byCat = new Map<string, ActualRow>()
      const totals = zeros()
      for (const t of inYear) {
        if (!want(t)) continue
        const ec = effectiveCategoryId(t, typeMap)
        if (groupOfCategory(ec, groupIds, catById) !== groupId) continue
        const key = ec ?? `type:${t.type ?? ""}`
        const name = (ec && catById.get(ec)?.name) || t.type || "Uncategorised"
        let row = byCat.get(key)
        if (!row) {
          row = { key, name, months: zeros(), total: 0 }
          byCat.set(key, row)
        }
        const mo = Number(t.booked_date.slice(5, 7)) - 1
        const v = Math.abs(Number(t.amount))
        row.months[mo] += v
        row.total += v
        totals[mo] += v
      }
      const rows = Array.from(byCat.values()).sort((a, b) => b.total - a.total)
      return { rows, totals }
    }

    const out: Band[] = []

    for (const g of groups) {
      const billItems = billEntries.filter((e) => e.category_id === g.id)
      const incomeItems = incomeEntries.filter((e) => e.category_id === g.id)
      const kind: "bill" | "income" =
        incomeItems.length > 0 && billItems.length === 0 ? "income" : "bill"
      const budgetItems = kind === "income" ? incomeItems : billItems
      const budget = monthlySubtotals(budgetItems, ctx)
      const want =
        kind === "income"
          ? (t: Transaction) => !isInternalTx(t) && Number(t.amount) > 0
          : isSpending
      const { rows, totals } = rowsFor(g.id, want)
      out.push({
        key: g.id,
        name: g.name,
        kind,
        budget,
        hasBudget: budgetItems.length > 0,
        rows,
        actual: totals,
      })
    }

    // Trailing band: spending whose bank type isn't assigned to a group yet.
    const { rows: unRows, totals: unTotals } = rowsFor(null, isSpending)
    if (unRows.length > 0) {
      out.push({
        key: "__unassigned__",
        name: "Unassigned",
        kind: "bill",
        budget: zeros(),
        hasBudget: false,
        rows: unRows,
        actual: unTotals,
      })
    }

    // Hide chosen groups that have neither budget nor actuals this year.
    return out.filter(
      (b) => b.hasBudget || b.rows.length > 0 || b.key === "__unassigned__",
    )
  }, [transactions, groups, categories, typeMap, billEntries, incomeEntries, ctx, year])

  const [hoverCol, setHoverCol] = useState<number | null>(null)
  const colBg = (m: number) => (hoverCol === m ? "bg-primary/5" : "")
  const [calMonth, setCalMonth] = useState<number | null>(null)

  const calEvents: CalEvent[] = useMemo(() => {
    if (calMonth == null) return []
    const catById = new Map(categories.map((c) => [c.id, c]))
    const key = `${year}-${String(calMonth).padStart(2, "0")}`
    return transactions
      .filter(
        (t) =>
          t.booked_date.slice(0, 7) === key &&
          !isInternalTx(t) &&
          Number(t.amount) !== 0,
      )
      .map((t) => {
        const ec = effectiveCategoryId(t, typeMap)
        const amt = Number(t.amount)
        return {
          day: Number(t.booked_date.slice(8, 10)),
          name: (ec && catById.get(ec)?.name) || t.type || "Uncategorised",
          amount: Math.abs(amt),
          kind: amt > 0 ? "income" : "bill",
        } as CalEvent
      })
  }, [calMonth, transactions, categories, typeMap, year])
  const avg12 = (total: number) => total / 12
  const avgActive = (months: number[], total: number) => {
    const n = months.filter((m) => m > 0).length
    return n ? total / n : 0
  }

  if (groups.length === 0) {
    return (
      <div className="text-muted-foreground rounded-lg border py-10 text-center text-sm">
        No groups yet. Groups are the categories your Bills and Income use — add
        an entry under a category to create one.
      </div>
    )
  }

  if (bands.length === 0) {
    return (
      <div className="text-muted-foreground rounded-lg border py-10 text-center text-sm">
        No budget or spending to show for {year}.
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto rounded-lg border">
        <table
          className="w-full border-collapse text-sm"
          onMouseOver={(e) => {
            const el = (e.target as HTMLElement).closest("[data-col]")
            setHoverCol(el ? Number(el.getAttribute("data-col")) : null)
          }}
          onMouseLeave={() => setHoverCol(null)}
        >
          <thead>
            <tr className="bg-muted border-b">
              <th
                className={cn(sticky, "bg-muted px-3 py-2 text-left font-medium")}
              >
                Group
              </th>
              {MONTHS_SHORT.map((m, i) => (
                <th
                  key={m}
                  data-col={i + 1}
                  onClick={() => setCalMonth(i + 1)}
                  title={`${MONTHS_LONG[i]} ${year} — day by day`}
                  className={cn(
                    "text-muted-foreground hover:text-foreground cursor-pointer px-1 py-2 text-right font-medium",
                    colBg(i + 1),
                  )}
                >
                  {m}
                </th>
              ))}
              <th className="px-2 py-2 text-right font-semibold">Total</th>
              <th className="text-muted-foreground px-2 py-2 text-right font-medium">
                Avg
              </th>
            </tr>
          </thead>
          <tbody>
            {bands.map((band, idx) => {
              const budgetTotal = sum(band.budget)
              const actualTotal = sum(band.actual)
              const diff = band.budget.map((b, i) => band.actual[i] - b)
              const diffTotal = actualTotal - budgetTotal
              // For bills, spending over budget is "bad"; for income, a
              // shortfall (negative diff) is "bad".
              const badSign = (v: number) =>
                band.kind === "income" ? v < 0 : v > 0
              return (
                <Fragment key={band.key}>
                  {idx > 0 && (
                    <tr aria-hidden>
                      <td
                        colSpan={COLS}
                        className="bg-background h-6 border-0 p-0"
                      />
                    </tr>
                  )}

                  {/* Group header */}
                  <tr className="bg-muted border-y">
                    <td
                      className={cn(
                        sticky,
                        "bg-muted px-3 py-2 font-semibold whitespace-nowrap",
                      )}
                    >
                      {band.name}
                      {band.kind === "income" && (
                        <span className="text-muted-foreground ml-1.5 text-xs font-normal">
                          income
                        </span>
                      )}
                    </td>
                    <td
                      className="text-muted-foreground px-2 py-2 text-right text-xs"
                      colSpan={14}
                    />
                  </tr>

                  {/* Budgeted line */}
                  <tr className="border-b">
                    <td
                      className={cn(
                        sticky,
                        "bg-background text-muted-foreground px-3 py-1.5 whitespace-nowrap",
                      )}
                    >
                      Budgeted
                    </td>
                    {band.budget.map((v, i) => (
                      <td
                        key={i}
                        data-col={i + 1}
                        className={cn(
                          "text-muted-foreground px-1 py-1.5 text-right tabular-nums whitespace-nowrap",
                          colBg(i + 1),
                        )}
                      >
                        {v ? formatNumber(v) : "–"}
                      </td>
                    ))}
                    <td className="px-2 py-1.5 text-right font-semibold tabular-nums whitespace-nowrap">
                      {formatNumber(budgetTotal)}
                    </td>
                    <td className="text-muted-foreground px-2 py-1.5 text-right tabular-nums whitespace-nowrap">
                      {formatNumber(avg12(budgetTotal))}
                    </td>
                  </tr>

                  {/* Actual rows, one per bank type */}
                  {band.rows.map((row) => (
                    <tr key={row.key} className="border-b">
                      <td
                        className={cn(
                          sticky,
                          "bg-background px-3 py-1.5 pl-6 whitespace-nowrap",
                        )}
                      >
                        {row.name}
                      </td>
                      {row.months.map((v, i) => (
                        <td
                          key={i}
                          data-col={i + 1}
                          className={cn(
                            "px-1 py-1.5 text-right tabular-nums whitespace-nowrap",
                            colBg(i + 1),
                            v ? "" : "text-muted-foreground/40",
                          )}
                        >
                          {v ? formatNumber(v) : "–"}
                        </td>
                      ))}
                      <td className="px-2 py-1.5 text-right font-medium tabular-nums whitespace-nowrap">
                        {formatNumber(row.total)}
                      </td>
                      <td className="text-muted-foreground px-2 py-1.5 text-right tabular-nums whitespace-nowrap">
                        {formatNumber(avgActive(row.months, row.total))}
                      </td>
                    </tr>
                  ))}
                  {band.rows.length === 0 && (
                    <tr className="border-b">
                      <td
                        className={cn(
                          sticky,
                          "bg-background text-muted-foreground/60 px-3 py-1.5 pl-6 text-xs italic whitespace-nowrap",
                        )}
                      >
                        no transactions
                      </td>
                      <td colSpan={14} />
                    </tr>
                  )}

                  {/* Actual total */}
                  <tr className="border-b">
                    <td
                      className={cn(
                        sticky,
                        "bg-background px-3 py-1.5 font-medium whitespace-nowrap",
                      )}
                    >
                      Actual total
                    </td>
                    {band.actual.map((v, i) => (
                      <td
                        key={i}
                        data-col={i + 1}
                        className={cn(
                          "px-1 py-1.5 text-right font-medium tabular-nums whitespace-nowrap",
                          colBg(i + 1),
                        )}
                      >
                        {v ? formatNumber(v) : "–"}
                      </td>
                    ))}
                    <td className="px-2 py-1.5 text-right font-semibold tabular-nums whitespace-nowrap">
                      {formatNumber(actualTotal)}
                    </td>
                    <td className="text-muted-foreground px-2 py-1.5 text-right tabular-nums whitespace-nowrap">
                      {formatNumber(avg12(actualTotal))}
                    </td>
                  </tr>

                  {/* Difference (only meaningful when a budget exists) */}
                  {band.hasBudget && (
                    <tr className="border-b-2">
                      <td
                        className={cn(
                          sticky,
                          "bg-background text-muted-foreground px-3 py-1.5 whitespace-nowrap",
                        )}
                      >
                        Difference
                      </td>
                      {diff.map((v, i) => (
                        <td
                          key={i}
                          data-col={i + 1}
                          className={cn(
                            "px-1 py-1.5 text-right tabular-nums whitespace-nowrap",
                            colBg(i + 1),
                            v === 0
                              ? "text-muted-foreground/40"
                              : badSign(v)
                                ? "text-red-600 dark:text-red-400"
                                : "text-emerald-600 dark:text-emerald-400",
                          )}
                        >
                          {v === 0
                            ? "–"
                            : `${v > 0 ? "+" : ""}${formatNumber(v)}`}
                        </td>
                      ))}
                      <td
                        className={cn(
                          "px-2 py-1.5 text-right font-semibold tabular-nums whitespace-nowrap",
                          diffTotal === 0
                            ? "text-muted-foreground"
                            : badSign(diffTotal)
                              ? "text-red-600 dark:text-red-400"
                              : "text-emerald-600 dark:text-emerald-400",
                        )}
                      >
                        {diffTotal > 0 ? "+" : ""}
                        {formatNumber(diffTotal)}
                      </td>
                      <td />
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="text-muted-foreground text-xs">
        Budgeted comes from your Bills/Income; actuals are the categories that
        roll up into each group for {year}.{" "}
        <span className="text-red-600 dark:text-red-400">Red</span> on Difference
        means over budget (or below expected income).{" "}
        <span className="text-foreground font-medium">
          {formatNOK(
            bands
              .filter((b) => b.hasBudget && b.kind === "bill")
              .reduce((s, b) => s + (sum(b.actual) - sum(b.budget)), 0),
          )}
        </span>{" "}
        net over/under on budgeted spending. Click a month name for a day-by-day
        calendar.
      </p>

      <MonthCalendar
        open={calMonth != null}
        onOpenChange={(o) => !o && setCalMonth(null)}
        year={Number(year)}
        month={calMonth ?? 1}
        subtitle="Actual income & spending"
        events={calEvents}
      />
    </div>
  )
}
