"use client"

import { Fragment, useMemo, useRef, useState } from "react"

import type { Category, Transaction } from "@/lib/types"
import { formatNumber } from "@/lib/format"
import { cn } from "@/lib/utils"
import { MONTHS_SHORT, MONTHS_LONG } from "@/lib/budget"
import { MonthCalendar, type CalEvent } from "@/components/calendar/month-calendar"
import {
  effectiveCategoryId,
  effectiveDate,
  deriveStem,
  isSpending,
  isInternalTx,
  type TypeMap,
} from "@/lib/spending"

// Freeze the first column only on ≥sm screens (see entries-grid for why).
const sticky = "sm:sticky sm:left-0 sm:z-10"
const COLS = 15 // name + 12 months + total + avg
const HOLD_MS = 350 // press longer than this = "full list" drill

export type DrillMode = "filter" | "full"

type Item = { key: string; name: string; months: number[]; total: number }
type Band = { key: string; name: string; order: number; items: Item[]; subtotals: number[] }

export function ActualsGrid({
  transactions,
  categories,
  typeMap,
  kind,
  year,
  onDrill,
}: {
  transactions: Transaction[]
  categories: Category[]
  typeMap: TypeMap
  kind: "bill" | "income"
  year: string
  /**
   * Jump to these transactions. mode "filter" (quick click) filters the list to
   * the cell; "full" (click-and-hold) opens the full list and highlights it.
   */
  onDrill?: (period: string, merchant: string, mode: DrillMode) => void
}) {
  const { bands, grand, grandTotal } = useMemo(() => {
    const wanted = (t: Transaction) =>
      kind === "bill"
        ? isSpending(t)
        : !isInternalTx(t) && Number(t.amount) > 0
    type RawBand = { name: string; order: number; items: Map<string, Item> }
    const map = new Map<string, RawBand>()

    for (const t of transactions) {
      if (effectiveDate(t).slice(0, 4) !== year || !wanted(t)) continue
      const catId = effectiveCategoryId(t, typeMap)
      const bandKey = catId ?? "uncat"
      let band = map.get(bandKey)
      if (!band) {
        const cat = catId ? categories.find((c) => c.id === catId) : null
        band = {
          name: cat?.name ?? "Uncategorised",
          order: cat?.sort_order ?? Number.MAX_SAFE_INTEGER,
          items: new Map(),
        }
        map.set(bandKey, band)
      }
      const itemKey = deriveStem(t.description) || t.description || t.type || "Other"
      let item = band.items.get(itemKey)
      if (!item) {
        item = {
          key: itemKey,
          name: t.description || t.type || "Other",
          months: Array(12).fill(0),
          total: 0,
        }
        band.items.set(itemKey, item)
      }
      const mo = Number(effectiveDate(t).slice(5, 7)) - 1
      const v = Math.abs(Number(t.amount))
      item.months[mo] += v
      item.total += v
    }

    const bands: Band[] = Array.from(map.entries())
      .map(([key, b]) => {
        const items = Array.from(b.items.values()).sort(
          (a, z) => z.total - a.total,
        )
        const subtotals = Array(12).fill(0)
        for (const it of items)
          for (let i = 0; i < 12; i++) subtotals[i] += it.months[i]
        return { key, name: b.name, order: b.order, items, subtotals }
      })
      .sort((a, z) => a.order - z.order || a.name.localeCompare(z.name))

    const grand = Array(12).fill(0)
    for (const b of bands)
      for (let i = 0; i < 12; i++) grand[i] += b.subtotals[i]
    const grandTotal = grand.reduce((s, v) => s + v, 0)

    return { bands, grand, grandTotal }
  }, [transactions, categories, typeMap, kind, year])

  const avg = (total: number, months: number[]) => {
    const active = months.filter((m) => m > 0).length
    return active ? total / active : 0
  }

  // Same column-hover highlight as the budget grids: weak tint on the column,
  // stronger on the hovered cell.
  const [hoverCol, setHoverCol] = useState<number | null>(null)
  const colBg = (m: number) => (hoverCol === m ? "bg-primary/5" : "")
  const pressStart = useRef(0)
  const [calMonth, setCalMonth] = useState<number | null>(null)

  const wanted = (t: Transaction) =>
    kind === "bill" ? isSpending(t) : !isInternalTx(t) && Number(t.amount) > 0
  const calGetEvents = (yy: number, m: number): CalEvent[] => {
    const key = `${yy}-${String(m).padStart(2, "0")}`
    return transactions
      .filter((t) => effectiveDate(t).slice(0, 7) === key && wanted(t))
      .map((t) => ({
        day: Number(effectiveDate(t).slice(8, 10)),
        name: t.description || t.type || "—",
        amount: Math.abs(Number(t.amount)),
        kind,
        merchant: deriveStem(t.description) || t.type || "",
      }))
  }

  if (bands.length === 0) {
    return (
      <div className="text-muted-foreground rounded-lg border py-10 text-center text-sm">
        No {kind === "bill" ? "spending" : "income"} in {year}.
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
              <th className={cn(sticky, "bg-muted px-3 py-2 text-left font-medium")}>
                {kind === "bill" ? "Merchant" : "Source"}
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
              const annual = band.subtotals.reduce((s, v) => s + v, 0)
              return (
                <Fragment key={band.key}>
                  {idx > 0 && (
                    <tr aria-hidden>
                      <td colSpan={COLS} className="bg-background h-6 border-0 p-0" />
                    </tr>
                  )}
                  <tr className="bg-muted border-y">
                    <td className={cn(sticky, "bg-muted px-3 py-2 font-semibold whitespace-nowrap")}>
                      {band.name}
                    </td>
                    {band.subtotals.map((t, i) => (
                      <td
                        key={i}
                        data-col={i + 1}
                        className={cn(
                          "px-1 py-2 text-right font-medium tabular-nums whitespace-nowrap",
                          colBg(i + 1),
                        )}
                      >
                        {t ? formatNumber(t) : ""}
                      </td>
                    ))}
                    <td className="px-2 py-2 text-right font-semibold tabular-nums whitespace-nowrap">
                      {formatNumber(annual)}
                    </td>
                    <td />
                  </tr>
                  {band.items.map((it) => (
                    <tr key={it.key} className="border-b last:border-0">
                      <td className={cn(sticky, "bg-background px-3 py-1.5 whitespace-nowrap")}>
                        <span className="font-medium">{it.name}</span>
                      </td>
                      {it.months.map((v, i) => {
                        const period = `${year}-${String(i + 1).padStart(2, "0")}`
                        const clickable = v > 0 && !!onDrill
                        return (
                          <td
                            key={i}
                            data-col={i + 1}
                            onPointerDown={
                              clickable
                                ? () => {
                                    pressStart.current = Date.now()
                                  }
                                : undefined
                            }
                            onPointerUp={
                              clickable
                                ? () => {
                                    const held =
                                      Date.now() - pressStart.current >= HOLD_MS
                                    onDrill!(
                                      period,
                                      it.key,
                                      held ? "full" : "filter",
                                    )
                                  }
                                : undefined
                            }
                            title={
                              clickable
                                ? "Click to filter · hold to see all & highlight"
                                : undefined
                            }
                            className={cn(
                              "px-1 py-1.5 text-right tabular-nums whitespace-nowrap select-none",
                              colBg(i + 1),
                              v ? "" : "text-muted-foreground/40",
                              clickable && "hover:bg-muted cursor-pointer",
                            )}
                          >
                            {v ? formatNumber(v) : "–"}
                          </td>
                        )
                      })}
                      <td className="px-2 py-1.5 text-right font-semibold tabular-nums whitespace-nowrap">
                        {formatNumber(it.total)}
                      </td>
                      <td className="text-muted-foreground px-2 py-1.5 text-right tabular-nums whitespace-nowrap">
                        {formatNumber(avg(it.total, it.months))}
                      </td>
                    </tr>
                  ))}
                </Fragment>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="bg-muted border-t-2 font-semibold">
              <td className={cn(sticky, "bg-muted px-3 py-2")}>Total</td>
              {grand.map((t, i) => (
                <td
                  key={i}
                  data-col={i + 1}
                  className={cn(
                    "px-1 py-2 text-right tabular-nums whitespace-nowrap",
                    colBg(i + 1),
                  )}
                >
                  {formatNumber(t)}
                </td>
              ))}
              <td className="px-2 py-2 text-right tabular-nums whitespace-nowrap">
                {formatNumber(grandTotal)}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
      <MonthCalendar
        open={calMonth != null}
        onOpenChange={(o) => !o && setCalMonth(null)}
        initialYear={Number(year)}
        initialMonth={calMonth ?? 1}
        subtitle={`Actual ${kind === "bill" ? "spending" : "income"}`}
        getEvents={calGetEvents}
        onEventClick={
          onDrill
            ? (e, yy, m) => {
                if (!e.merchant) return
                onDrill(
                  `${yy}-${String(m).padStart(2, "0")}`,
                  e.merchant,
                  "filter",
                )
                setCalMonth(null)
              }
            : undefined
        }
      />
    </div>
  )
}
