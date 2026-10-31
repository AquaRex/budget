"use client"

import { Fragment, useState } from "react"
import { MoreHorizontal, Plus } from "lucide-react"
import { toast } from "sonner"

import { errMessage } from "@/lib/errors"
import { MONTHS_SHORT } from "@/lib/budget"
import { cn } from "@/lib/utils"
import { formatNumber } from "@/lib/format"
import type { Holding, HoldingResult } from "@/lib/savings/types"
import { monthIndexOf } from "@/lib/savings/compute"
import type { SavingsModel } from "@/lib/savings/use-savings-model"
import { deleteHolding, setPrice } from "@/lib/data/savings"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { HoldingDialog } from "@/components/savings/holding-dialog"
import {
  TradeDialog,
  type TradeTarget,
} from "@/components/savings/trade-dialog"
import {
  KIND_LABEL,
  formatUnitsShort,
  parseNumber,
} from "@/components/savings/format"
import { up } from "@/components/stats/display"

const sticky = "sm:sticky sm:left-0 sm:z-10"
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1)

/** Holdings × months for one year: what was bought/sold, the price, what it's worth. */
export function SavingsGrid({
  model,
  year,
}: {
  model: SavingsModel
  year: number
}) {
  const { holdings, results, trades, prices, todayIndex, mutate } = model
  const [editing, setEditing] = useState<Holding | null>(null)
  const [adding, setAdding] = useState(false)
  const [removing, setRemoving] = useState<Holding | null>(null)
  const [target, setTarget] = useState<TradeTarget | null>(null)

  const indices = MONTHS.map((m) => monthIndexOf(year, m))
  const shown = (i: number) => i <= todayIndex

  async function remove() {
    const h = removing
    setRemoving(null)
    if (!h) {
      return
    }
    try {
      await deleteHolding(h.id)
      mutate()
    } catch (e) {
      toast.error(errMessage(e, "Could not delete."))
    }
  }

  async function commitPrice(h: Holding, month: number, price: number | null) {
    try {
      await setPrice(h.id, year, month, price)
      mutate()
    } catch (e) {
      toast.error(errMessage(e, "Could not save the price."))
    }
  }

  const totalValue = (i: number) =>
    results.reduce(
      (s, r) => s + (r.months.find((m) => m.monthIndex === i)?.value ?? 0),
      0,
    )
  const paidIn = (r: HoldingResult, i: number) => {
    const at = r.months.find((m) => m.monthIndex === i)
    if (!at) {
      return 0
    }
    const before = r.months.find((m) => m.monthIndex === i - 1)
    return at.paid - (before?.paid ?? 0)
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-muted-foreground text-xs">
          Click a month to enter what you bought or sold. Linked holdings take
          the market price each month; type a price to override it, or for
          holdings entered by hand.
        </p>
        <Button size="sm" onClick={() => setAdding(true)}>
          <Plus className="size-4" />
          Add holding
        </Button>
      </div>

      {holdings.length === 0 ? (
        <div className="text-muted-foreground border py-12 text-center text-sm">
          No holdings yet. Add a fund, stock or your employee share plan to
          start.
        </div>
      ) : (
        <div className="overflow-x-auto border">
          <table className="w-full min-w-[1100px] border-collapse text-sm">
            <thead>
              <tr className="bg-muted text-muted-foreground border-b text-[11px] tracking-wider uppercase">
                <th
                  className={cn(
                    sticky,
                    "bg-muted w-56 px-3 py-2 text-left font-medium",
                  )}
                >
                  {year}
                </th>
                {MONTHS.map((m, k) => (
                  <th
                    key={m}
                    className={cn(
                      "px-1 py-2 text-right font-medium",
                      indices[k] === todayIndex && "text-foreground",
                    )}
                  >
                    {MONTHS_SHORT[m - 1]}
                  </th>
                ))}
                <th className="border-l px-3 py-2 text-right font-medium">
                  Year
                </th>
              </tr>
            </thead>
            <tbody>
              {results.map((r) => {
                const h = r.holding
                const at = (i: number) =>
                  r.months.find((m) => m.monthIndex === i)
                const bonusAt = (i: number) =>
                  r.lots
                    .filter((l) => l.source === "bonus" && l.monthIndex === i)
                    .reduce((s, l) => s + l.bought, 0)
                const tradeAt = (month: number, side: "buy" | "sell") =>
                  trades.find(
                    (t) =>
                      t.holding_id === h.id &&
                      t.year === year &&
                      t.month === month &&
                      t.side === side,
                  )
                const yearPaid = indices.reduce((s, i) => s + paidIn(r, i), 0)
                const lastShown = [...indices]
                  .reverse()
                  .find((i) => shown(i) && at(i))
                const yearEnd =
                  lastShown !== undefined ? at(lastShown) : undefined
                return (
                  <Fragment key={h.id}>
                    <tr className="bg-muted/40 border-t">
                      <td
                        className={cn(sticky, "bg-muted px-3 py-1.5")}
                        colSpan={1}
                      >
                        <div className="flex items-center gap-2">
                          <span className="flex min-w-0 flex-col">
                            <span className="truncate font-semibold">
                              {h.name}
                            </span>
                            <span className="text-muted-foreground text-[10px]">
                              {h.symbol ?? "prices by hand"}
                            </span>
                          </span>
                          <Badge variant="secondary" className="font-normal">
                            {KIND_LABEL[h.kind]}
                            {h.kind === "plan" && ` · −${h.discount_pct}%`}
                          </Badge>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                className="ml-auto"
                                aria-label={`${h.name} actions`}
                              >
                                <MoreHorizontal className="size-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onSelect={() => setEditing(h)}>
                                Edit…
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                variant="destructive"
                                onSelect={() => setRemoving(h)}
                              >
                                Delete…
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </td>
                      <td colSpan={13} />
                    </tr>

                    <tr>
                      <RowLabel>Bought / sold</RowLabel>
                      {MONTHS.map((m, k) => {
                        const buy = tradeAt(m, "buy")
                        const sell = tradeAt(m, "sell")
                        const bonus = bonusAt(indices[k])
                        return (
                          <td key={m} className="px-0.5 py-0.5 align-top">
                            <button
                              type="button"
                              onClick={() =>
                                setTarget({ holding: h, year, month: m })
                              }
                              title={
                                buy?.trade_date
                                  ? `Bought ${buy.trade_date}${buy.trade_time ? ` ${buy.trade_time}` : ""}`
                                  : undefined
                              }
                              className="hover:bg-muted flex min-h-9 w-full flex-col items-end justify-center px-1 text-right tabular-nums"
                            >
                              {!buy && !sell && !bonus && (
                                <span className="text-muted-foreground/40">
                                  –
                                </span>
                              )}
                              {buy && (
                                <>
                                  <span className="font-medium">
                                    +{formatUnitsShort(buy.units)}
                                  </span>
                                  <span className="text-muted-foreground text-[10px]">
                                    {formatNumber(buy.amount)} kr
                                  </span>
                                </>
                              )}
                              {sell && (
                                <span className="font-medium text-rose-600 dark:text-rose-400">
                                  −{formatUnitsShort(sell.units)}
                                </span>
                              )}
                              {bonus > 0 && (
                                <span
                                  className={cn(
                                    "text-[10px] font-semibold",
                                    up,
                                  )}
                                >
                                  +{formatUnitsShort(bonus)} bonus
                                </span>
                              )}
                            </button>
                          </td>
                        )
                      })}
                      <td className="border-l px-3 text-right tabular-nums">
                        {yearPaid ? `${formatNumber(yearPaid)} kr` : "–"}
                      </td>
                    </tr>

                    <tr>
                      <RowLabel>Price / unit</RowLabel>
                      {MONTHS.map((m, k) => {
                        const month = at(indices[k])
                        return (
                          <td key={m} className="px-0.5 py-0.5">
                            <PriceCell
                              price={month?.price ?? null}
                              explicit={month?.explicitPrice ?? false}
                              market={month?.marketPrice ?? false}
                              onCommit={(p) => commitPrice(h, m, p)}
                            />
                          </td>
                        )
                      })}
                      <td className="border-l px-3 text-right tabular-nums">
                        {yearEnd?.price != null
                          ? formatNumber(yearEnd.price)
                          : "–"}
                      </td>
                    </tr>

                    <tr className="text-muted-foreground">
                      <RowLabel>Units held</RowLabel>
                      {indices.map((i) => {
                        const month = at(i)
                        return (
                          <td
                            key={i}
                            className="px-1.5 py-1 text-right text-xs tabular-nums"
                          >
                            {shown(i) && month
                              ? formatUnitsShort(month.units)
                              : ""}
                          </td>
                        )
                      })}
                      <td className="border-l px-3 text-right text-xs tabular-nums">
                        {yearEnd ? formatUnitsShort(yearEnd.units) : "–"}
                      </td>
                    </tr>

                    <tr>
                      <RowLabel>Value</RowLabel>
                      {indices.map((i) => {
                        const month = at(i)
                        return (
                          <td
                            key={i}
                            className="px-1.5 py-1 text-right tabular-nums"
                          >
                            {shown(i) && month ? formatNumber(month.value) : ""}
                          </td>
                        )
                      })}
                      <td className="border-l px-3 text-right font-semibold tabular-nums">
                        {yearEnd ? `${formatNumber(yearEnd.value)} kr` : "–"}
                      </td>
                    </tr>
                  </Fragment>
                )
              })}
              <tr className="bg-muted border-t-2 font-semibold">
                <td className={cn(sticky, "bg-muted px-3 py-2 text-left")}>
                  Total value
                </td>
                {indices.map((i) => (
                  <td key={i} className="px-1.5 py-2 text-right tabular-nums">
                    {shown(i) && totalValue(i)
                      ? formatNumber(totalValue(i))
                      : ""}
                  </td>
                ))}
                <td className="border-l px-3 text-right tabular-nums">
                  {(() => {
                    const last = [...indices].reverse().find(shown)
                    return last !== undefined && totalValue(last)
                      ? `${formatNumber(totalValue(last))} kr`
                      : "–"
                  })()}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      <HoldingDialog
        open={adding || !!editing}
        holding={editing}
        nextSortOrder={holdings.length}
        onClose={() => {
          setAdding(false)
          setEditing(null)
        }}
        onSaved={mutate}
      />
      <TradeDialog
        target={target}
        trades={trades}
        prices={prices}
        onClose={() => setTarget(null)}
        onSaved={mutate}
      />
      <AlertDialog
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {removing?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the holding with every buy, sale and price entered
              for it, in all years. It can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={remove}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function RowLabel({ children }: { children: React.ReactNode }) {
  return (
    <td
      className={cn(
        sticky,
        "bg-card text-muted-foreground px-3 py-1 pl-6 text-xs",
      )}
    >
      {children}
    </td>
  )
}

/** Entered prices bold, market closes plain, carried or purchase-implied prices muted. */
function PriceCell({
  price,
  explicit,
  market,
  onCommit,
}: {
  price: number | null
  explicit: boolean
  market: boolean
  onCommit: (price: number | null) => void
}) {
  const [draft, setDraft] = useState<string | null>(null)

  function commit() {
    if (draft === null) {
      return
    }
    const value = parseNumber(draft)
    setDraft(null)
    if (value === null || value === 0) {
      if (explicit) {
        onCommit(null)
      }
      return
    }
    if (!explicit || value !== price) {
      onCommit(value)
    }
  }

  if (draft !== null) {
    return (
      <input
        autoFocus
        inputMode="decimal"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            commit()
          } else if (e.key === "Escape") {
            setDraft(null)
          }
        }}
        onFocus={(e) => e.currentTarget.select()}
        className="border-primary bg-background h-8 w-full min-w-16 border px-1 text-right text-sm tabular-nums outline-none"
      />
    )
  }
  return (
    <button
      type="button"
      onClick={() => setDraft(explicit && price !== null ? String(price) : "")}
      title={
        explicit
          ? "Price you entered (overrides the market)"
          : market
            ? "Market close for the month — click to override"
            : price !== null
              ? "Carried from an earlier month or purchase"
              : "Enter a price"
      }
      className={cn(
        "hover:bg-muted h-8 w-full min-w-16 px-1 text-right tabular-nums",
        explicit
          ? "text-foreground font-medium"
          : market
            ? "text-foreground"
            : "text-muted-foreground",
        price === null && "text-muted-foreground/40",
      )}
    >
      {price === null ? "–" : formatUnitsShort(price)}
    </button>
  )
}
