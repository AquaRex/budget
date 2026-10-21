"use client"

import { Fragment, useState } from "react"
import { ChevronRight } from "lucide-react"

import type { Category, Transaction } from "@/lib/types"
import { MONTHS_SHORT, MONTHS_LONG } from "@/lib/budget"
import { formatNumber } from "@/lib/format"
import { cn } from "@/lib/utils"
import { useRouter } from "next/navigation"

import {
  effectiveCategoryId,
  effectiveDate,
  deriveStem,
  isInternalTx,
  type TypeMap,
} from "@/lib/spending"
import { NO_LABEL, type GroupBand } from "@/lib/stats/groups"
import type { MonthStatus } from "@/lib/stats/types"
import { MonthCalendar, type CalEvent } from "@/components/calendar/month-calendar"
import { down, signedKr, up } from "@/components/stats/display"
import {
  DiffLegend,
  diffFill,
  diffLevel,
  isSettled,
} from "@/components/groups/diff-heat"

// Freeze the first column on ≥sm screens, like the other grids.
const sticky = "sm:sticky sm:left-0 sm:z-10"
const COLS = 15 // name + 12 months + total + avg

export function GroupsGrid({
  transactions,
  groups,
  categories,
  typeMap,
  year,
  statuses,
  bands,
}: {
  transactions: Transaction[]
  groups: Category[] // categories used by Bills/Income, in sort order
  categories: Category[] // the full pool (for category -> group resolution)
  typeMap: TypeMap
  year: string
  statuses: MonthStatus[] // 12, from computeGroupsMatrix
  bands: GroupBand[] // from computeGroupsMatrix
}) {

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

  if (groups.length === 0) {
    return (
      <div className="text-muted-foreground border py-10 text-center text-sm">
        No groups yet. Groups are the categories your Bills and Income use — add
        an entry under a category to create one.
      </div>
    )
  }

  if (bands.length === 0) {
    return (
      <div className="text-muted-foreground border py-10 text-center text-sm">
        No budget or spending to show for {year}.
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <DiffLegend />
      <div className="overflow-x-auto border">
        <table
          className="w-full border-collapse text-sm"
          onMouseOver={(e) => {
            const el = (e.target as HTMLElement).closest("[data-col]")
            setHoverCol(el ? Number(el.getAttribute("data-col")) : null)
          }}
          onMouseLeave={() => setHoverCol(null)}
        >
          <thead>
            <tr className="bg-muted border-b text-[11px] tracking-wider uppercase">
              <th
                className={cn(sticky, "bg-muted px-3 py-2 text-left font-medium")}
              >
                Group
              </th>
              <th className="px-2 py-2 text-right font-semibold">Total</th>
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
              <th className="text-muted-foreground px-2 py-2 text-right font-medium">
                Avg
              </th>
            </tr>
          </thead>
          <tbody>
            {bands.map((band, idx) => {
              // Difference is signed so + is always good, so red is always "−".
              const { budgetTotal, actualTotal, diff } = band
              const badSign = (v: number) => v < 0
              // Income/savings still to come this month isn't a shortfall yet.
              const isPending = (v: number, i: number) =>
                band.kind !== "bill" && v < 0 && statuses[i] === "current"
              const current = statuses.indexOf("current")
              const pendingNow = current >= 0 && isPending(diff[current], current)
              const { diffToDate } = band
              return (
                <Fragment key={band.key}>
                  {idx > 0 && (
                    <tr aria-hidden>
                      <td
                        colSpan={COLS}
                        className="bg-background h-4 border-0 p-0"
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
                      {band.kind !== "bill" && (
                        <span
                          className={cn(
                            "ml-2 border px-1.5 py-0.5 text-[10px] font-semibold tracking-wider uppercase",
                            band.kind === "savings"
                              ? "border-emerald-500/40 text-emerald-700 dark:text-emerald-400"
                              : "text-muted-foreground",
                          )}
                        >
                          {band.kind}
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
                    <td className="px-2 py-1.5 text-right font-semibold tabular-nums whitespace-nowrap">
                      {formatNumber(budgetTotal)}
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
                    <td className="text-muted-foreground px-2 py-1.5 text-right tabular-nums whitespace-nowrap">
                      {formatNumber(band.budgetAvg)}
                    </td>
                  </tr>

                  {/* Actual rows, one per resolved category (expandable into labels) */}
                  {band.rows.map((row) => {
                    const expandable = row.subRows.length > 0
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
                          <td className="px-2 py-1.5 text-right font-medium tabular-nums whitespace-nowrap">
                            {formatNumber(row.total)}
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
                          <td className="text-muted-foreground px-2 py-1.5 text-right tabular-nums whitespace-nowrap">
                            {formatNumber(row.avg)}
                          </td>
                        </tr>

                        {/* Per-label breakdown */}
                        {isOpen &&
                          row.subRows.map((sub) => (
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
                              <td className="text-muted-foreground px-2 py-1 text-right text-xs tabular-nums whitespace-nowrap">
                                {formatNumber(sub.total)}
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
                    <td className="px-2 py-1.5 text-right font-semibold tabular-nums whitespace-nowrap">
                      {formatNumber(actualTotal)}
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
                    <td className="text-muted-foreground px-2 py-1.5 text-right tabular-nums whitespace-nowrap">
                      {formatNumber(band.actualAvg)}
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
                      <td
                        title={`Year to date: budget ${formatNumber(band.budgetToDate)}, ${signedKr(diffToDate)}${pendingNow ? " (this month's pending amount not counted yet)" : ""}`}
                        className={cn(
                          "px-2 py-1.5 text-right font-semibold tabular-nums whitespace-nowrap",
                          diffToDate === 0
                            ? "text-muted-foreground"
                            : badSign(diffToDate)
                              ? down
                              : up,
                        )}
                      >
                        <span className="text-muted-foreground mr-1.5 text-[10px] font-medium tracking-wider uppercase">
                          to date
                        </span>
                        {diffToDate > 0 ? "+" : ""}
                        {formatNumber(diffToDate)}
                      </td>
                      {diff.map((v, i) => {
                        // Settled months get the diverging fill; in-progress
                        // ones only coloured text; future/unimported stay grey.
                        const status = statuses[i]
                        const settled = isSettled(status)
                        const idle =
                          status === "future" ||
                          status === "no-data" ||
                          status === "partial"
                        const level = diffLevel(v, band.budget[i], band.budgetAvg)
                        const pending = isPending(v, i)
                        const note = settled
                          ? ""
                          : status === "partial"
                            ? " · partly imported"
                            : idle
                              ? " · no data yet"
                            : pending
                              ? " · still to come this month"
                              : " · month not complete"
                        return (
                          <td
                            key={i}
                            data-col={i + 1}
                            title={`${MONTHS_LONG[i]}: budget ${formatNumber(band.budget[i])}, actual ${formatNumber(band.actual[i])}, ${signedKr(v)}${note}`}
                            style={
                              settled
                                ? { backgroundColor: diffFill(level, v) }
                                : undefined
                            }
                            className={cn(
                              "px-1 py-1.5 text-right tabular-nums whitespace-nowrap",
                              colBg(i + 1),
                              v === 0 || idle
                                ? "text-muted-foreground/40"
                                : pending
                                  ? "text-muted-foreground"
                                  : settled
                                  ? level === 0
                                    ? "text-muted-foreground"
                                    : "text-foreground font-medium"
                                  : badSign(v)
                                    ? down
                                    : up,
                            )}
                          >
                            {v === 0
                              ? "–"
                              : `${v > 0 ? "+" : ""}${formatNumber(v)}`}
                          </td>
                        )
                      })}
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
