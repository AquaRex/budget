"use client"

import { useState } from "react"
import Link from "next/link"
import { ArrowUpRight, ChevronRight } from "lucide-react"

import { MONTHS_LONG } from "@/lib/budget"
import { cn } from "@/lib/utils"
import { sellableWithoutLoss } from "@/lib/savings/compute"
import { useSavingsModel } from "@/lib/savings/use-savings-model"
import type { HoldingResult } from "@/lib/savings/types"
import { Skeleton } from "@/components/ui/skeleton"
import { down, kr, signedKr, signedPct, up } from "@/components/stats/display"
import { SavingsChart } from "@/components/savings/savings-chart"
import { TradeDialog, type TradeTarget } from "@/components/savings/trade-dialog"
import { KIND_LABEL, formatUnitsShort, monthLabel } from "@/components/savings/format"
import { useOs } from "@/components/os/os-shell"

/** Savings at a glance; tap a holding to log the header month's buy or sale. */
export function OsSavings() {
  const { year, month } = useOs()
  const model = useSavingsModel()
  const [target, setTarget] = useState<TradeTarget | null>(null)
  const { results, series, todayIndex, trades, prices, mutate } = model

  if (model.isLoading) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-28" />
        <Skeleton className="h-48" />
      </div>
    )
  }
  if (model.error) {
    return (
      <p className="text-muted-foreground py-16 text-center text-sm">
        Savings needs a database update — see the Savings page on the website.
      </p>
    )
  }
  if (results.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <p className="text-sm">No holdings yet.</p>
        <Link href="/savings" className="text-muted-foreground flex items-center gap-1.5 text-xs">
          <ArrowUpRight className="size-4" aria-hidden /> Add funds and stocks on the website
        </Link>
      </div>
    )
  }

  const now = series.at(-1)
  const gain = now?.gain ?? 0
  const rate = now && now.paid > 0 ? gain / now.paid : null
  const plans = results.filter((r) => r.holding.kind === "plan" && r.lots.length > 0)

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <section className="flex flex-col gap-1 border p-3">
        <span className="text-muted-foreground text-[11px] font-semibold tracking-widest uppercase">Worth now</span>
        <span className="text-3xl font-semibold tabular-nums">{kr(now?.value ?? 0)}</span>
        <span className={cn("text-sm font-medium tabular-nums", gain > 0 ? up : gain < 0 ? down : "text-muted-foreground")}>
          {signedKr(gain)} · {signedPct(rate)}
          <span className="text-muted-foreground font-normal"> on {kr(now?.paid ?? 0)} paid in</span>
        </span>
      </section>

      {model.marketError && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          Market prices didn&apos;t load — showing entered and purchase prices.
        </p>
      )}

      <section className="border p-2" data-no-swipe>
        <SavingsChart points={series} height={180} />
      </section>

      {plans.map((r) => (
        <PlanCard key={r.holding.id} result={r} todayIndex={todayIndex} />
      ))}

      <section className="flex flex-col gap-2">
        <h2 className="text-muted-foreground px-1 text-[11px] font-semibold tracking-widest uppercase">
          Holdings · tap to log {MONTHS_LONG[month - 1]}
        </h2>
        <ul className="flex flex-col divide-y border">
          {results.map((r) => (
            <li key={r.holding.id}>
              <button
                type="button"
                onClick={() => setTarget({ holding: r.holding, year, month })}
                className="active:bg-muted flex min-h-16 w-full items-center gap-3 px-3 py-2 text-left"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{r.holding.name}</span>
                  <span className="text-muted-foreground text-xs">
                    {KIND_LABEL[r.holding.kind]} · {formatUnitsShort(r.units)} units
                  </span>
                </span>
                <span className="flex flex-col items-end">
                  <span className="text-sm font-semibold tabular-nums">{kr(r.value)}</span>
                  <span className={cn("text-xs tabular-nums", r.gain > 0 ? up : r.gain < 0 ? down : "text-muted-foreground")}>
                    {signedKr(r.gain)}
                  </span>
                </span>
                <ChevronRight className="text-muted-foreground size-4 shrink-0" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      </section>

      <Link href="/savings" className="text-muted-foreground flex min-h-11 items-center justify-center gap-2 text-xs">
        <ArrowUpRight className="size-4" aria-hidden /> Month grid and full bonus schedule on the website
      </Link>

      <TradeDialog
        target={target}
        trades={trades}
        prices={prices}
        onClose={() => setTarget(null)}
        onSaved={mutate}
      />
    </div>
  )
}

function PlanCard({ result, todayIndex }: { result: HoldingResult; todayIndex: number }) {
  const { holding, lots, price } = result
  const safe = sellableWithoutLoss(lots, todayIndex)
  const next = lots
    .filter((l) => l.source === "buy" && l.vestIndex !== null && l.vestIndex > todayIndex && l.held > 0)
    .sort((a, b) => (a.vestIndex ?? 0) - (b.vestIndex ?? 0))[0]
  return (
    <section className="flex flex-col gap-2 border p-3">
      <span className="text-muted-foreground text-[11px] font-semibold tracking-widest uppercase">
        {holding.name} · bonus
      </span>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col">
          <span className="text-muted-foreground text-xs">Sell now, no bonus lost</span>
          <span className="text-lg font-semibold tabular-nums">{formatUnitsShort(safe)}</span>
          {price !== null && <span className="text-muted-foreground text-xs tabular-nums">≈ {kr(safe * price)}</span>}
        </div>
        <div className="flex flex-col">
          <span className="text-muted-foreground text-xs">Next bonus</span>
          {next && next.vestIndex !== null ? (
            <>
              <span className={cn("text-lg font-semibold tabular-nums", up)}>+{formatUnitsShort(next.bonusUnits)}</span>
              <span className="text-muted-foreground text-xs">{monthLabel(next.vestIndex)}</span>
            </>
          ) : (
            <span className="text-muted-foreground text-sm">None waiting</span>
          )}
        </div>
      </div>
    </section>
  )
}
