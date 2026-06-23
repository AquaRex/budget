"use client"

import { Fragment, useMemo, useState } from "react"
import { ChevronRight } from "lucide-react"

import type { Category, Entry, Label, Transaction } from "@/lib/types"
import type { BudgetContext } from "@/lib/budget"
import { MONTHS_SHORT, MONTHS_LONG, monthlySubtotals } from "@/lib/budget"
import { formatNumber } from "@/lib/format"
import { cn } from "@/lib/utils"
import { useRouter } from "next/navigation"

import {
  effectiveCategoryId,
  effectiveDate,
  groupOfCategory,
  deriveStem,
  isSpending,
  isInternalTx,
  type TypeMap,
} from "@/lib/spending"
import { MonthCalendar, type CalEvent } from "@/components/calendar/month-calendar"

// Freeze the first column on ≥sm screens, like the other grids.
const sticky = "sm:sticky sm:left-0 sm:z-10"
const COLS = 15 // name + 12 months + total + avg
const NO_LABEL = "__nolabel__"

type ActualRow = {
  key: string
  name: string
  months: number[]
  total: number
  // Per-label breakdown of this category's spend (empty when nothing is labelled).
  subRows?: ActualRow[]
}
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
  labels,
  typeMap,
  billEntries,
  incomeEntries,
  ctx,
  year,
}: {
  transactions: Transaction[]
  groups: Category[] // categories used by Bills/Income, in sort order
  categories: Category[] // the full pool (for category -> group resolution)
  labels: Label[]
  typeMap: TypeMap
  billEntries: Entry[]
  incomeEntries: Entry[]
  ctx: BudgetContext
  year: string
}) {
  const bands = useMemo<Band[]>(() => {
    const inYear = transactions.filter(
      (t) => effectiveDate(t).slice(0, 4) === year,
    )
    const groupIds = new Set(groups.map((g) => g.id))
    const catById = new Map(categories.map((c) => [c.id, c]))
    const labelById = new Map(labels.map((l) => [l.id, l]))

    // Actual rows (one per resolved category) for a group + sign convention.
    // Each category row also carries a per-label breakdown for drill-down.
    const rowsFor = (
      groupId: string | null,
      want: (t: Transaction) => boolean,
    ): { rows: ActualRow[]; totals: number[] } => {
      const byCat = new Map<string, ActualRow>()
      const subByCat = new Map<string, Map<string, ActualRow>>()
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
          subByCat.set(key, new Map())
        }
        const mo = Number(effectiveDate(t).slice(5, 7)) - 1
        const v = Math.abs(Number(t.amount))
        row.months[mo] += v
        row.total += v
        totals[mo] += v

        // Per-label sub-row within this category.
        const subMap = subByCat.get(key)!
        const lkey = t.label_id ?? NO_LABEL
        const lname = t.label_id
          ? labelById.get(t.label_id)?.name ?? "Label"
          : "No label"
        let sub = subMap.get(lkey)
        if (!sub) {
          sub = { key: lkey, name: lname, months: zeros(), total: 0 }
          subMap.set(lkey, sub)
        }
        sub.months[mo] += v
        sub.total += v
      }
      for (const [key, row] of byCat) {
        const subs = Array.from(subByCat.get(key)!.values()).sort(
          (a, b) => b.total - a.total,
        )
        // Only worth expanding when something here is actually labelled.
        row.subRows = subs.some((s) => s.key !== NO_LABEL) ? subs : []
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
  }, [transactions, groups, categories, labels, typeMap, billEntries, incomeEntries, ctx, year])

  const [hoverCol, setHoverCol] = useState<number | null>(null)
  const colBg = (m: number) => (hoverCol === m ? "bg-primary/5" : "")
  const [calMonth, setCalMonth] = useState<number | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const router = useRouter()

  const toggleExpand = (key: string) =>
    setExpanded((s) => {
      const next = new Set(s)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  // Drill from a label sub-row into the matching transactions.
  const openLabel = (subKey: string) => {
    const q = subKey === NO_LABEL ? "__none__" : subKey
    router.push(`/spending?tab=transactions&period=all&label=${q}`)
  }

  const calGetEvents = (yy: number, m: number): CalEvent[] => {
    const catById = new Map(categories.map((c) => [c.id, c]))
    const key = `${yy}-${String(m).padStart(2, "0")}`
    return transactions
      .filter(
        (t) =>
          effectiveDate(t).slice(0, 7) === key &&
          !isInternalTx(t) &&
          Number(t.amount) !== 0,
      )
      .map((t) => {
        const ec = effectiveCategoryId(t, typeMap)
        const amt = Number(t.amount)
        return {
          day: Number(effectiveDate(t).slice(8, 10)),
          name: (ec && catById.get(ec)?.name) || t.type || "Uncategorised",
          amount: Math.abs(amt),
          kind: amt > 0 ? "income" : "bill",
          merchant: deriveStem(t.description) || t.type || "",
        } as CalEvent
      })
  }
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
              // Difference is signed so positive is always good: money saved
              // (bills under budget) or extra income; negative is over budget
              // / short on income. So red is always "−", green always "+".
              const dsign = band.kind === "income" ? 1 : -1
              const diff = band.budget.map((b, i) => dsign * (band.actual[i] - b))
              const diffTotal = dsign * (actualTotal - budgetTotal)
              const badSign = (v: number) => v < 0
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

                  {/* Actual rows, one per resolved category (expandable into labels) */}
                  {band.rows.map((row) => {
                    const expandable = (row.subRows?.length ?? 0) > 0
                    const ekey = `${band.key}:${row.key}`
                    const isOpen = expanded.has(ekey)
                    return (
                      <Fragment key={row.key}>
                        <tr className="border-b">
                          <td
                            className={cn(
                              sticky,
                              "bg-background px-3 py-1.5 pl-6 whitespace-nowrap",
                            )}
                          >
                            {expandable ? (
                              <button
                                type="button"
                                onClick={() => toggleExpand(ekey)}
                                className="hover:text-foreground -ml-4 inline-flex items-center gap-1 text-left"
                              >
                                <ChevronRight
                                  className={cn(
                                    "size-3.5 shrink-0 transition-transform",
                                    isOpen && "rotate-90",
                                  )}
                                />
                                {row.name}
                              </button>
                            ) : (
                              row.name
                            )}
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

                        {/* Per-label breakdown */}
                        {isOpen &&
                          row.subRows!.map((sub) => (
                            <tr key={sub.key} className="border-b">
                              <td
                                className={cn(
                                  sticky,
                                  "bg-background px-3 py-1 pl-12 whitespace-nowrap",
                                )}
                              >
                                <button
                                  type="button"
                                  onClick={() => openLabel(sub.key)}
                                  className={cn(
                                    "inline-flex items-center text-xs hover:underline",
                                    sub.key === NO_LABEL
                                      ? "text-muted-foreground/60 italic"
                                      : "text-muted-foreground hover:text-foreground",
                                  )}
                                >
                                  {sub.name}
                                </button>
                              </td>
                              {sub.months.map((v, i) => (
                                <td
                                  key={i}
                                  data-col={i + 1}
                                  className={cn(
                                    "px-1 py-1 text-right text-xs tabular-nums whitespace-nowrap",
                                    colBg(i + 1),
                                    v ? "text-muted-foreground" : "text-muted-foreground/30",
                                  )}
                                >
                                  {v ? formatNumber(v) : "–"}
                                </td>
                              ))}
                              <td className="text-muted-foreground px-2 py-1 text-right text-xs tabular-nums whitespace-nowrap">
                                {formatNumber(sub.total)}
                              </td>
                              <td />
                            </tr>
                          ))}
                      </Fragment>
                    )
                  })}
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
      <MonthCalendar
        open={calMonth != null}
        onOpenChange={(o) => !o && setCalMonth(null)}
        initialYear={Number(year)}
        initialMonth={calMonth ?? 1}
        subtitle="Actual income & spending"
        getEvents={calGetEvents}
        onEventClick={(e, yy, m) => {
          const period = `${yy}-${String(m).padStart(2, "0")}`
          const q = encodeURIComponent(e.merchant ?? "")
          router.push(`/spending?tab=transactions&period=${period}&q=${q}`)
        }}
      />
    </div>
  )
}
