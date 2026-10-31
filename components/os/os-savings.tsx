"use client"

import { useState } from "react"
import Link from "next/link"
import { ArrowUpRight, ChevronRight } from "lucide-react"

import { MONTHS_LONG, MONTHS_SHORT } from "@/lib/budget"
import { cn } from "@/lib/utils"
import { monthIndexOf, sellableWithoutLoss, yearOf } from "@/lib/savings/compute"
import { useSavingsModel } from "@/lib/savings/use-savings-model"
import type { Holding, HoldingResult, SavingsSeriesPoint } from "@/lib/savings/types"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { down, kr, signedKr, signedPct, up } from "@/components/stats/display"
import { SavingsChart } from "@/components/savings/savings-chart"
import { PlanTimeline } from "@/components/savings/plan-timeline"
import { TradeDialog, type TradeTarget } from "@/components/savings/trade-dialog"
import { KIND_LABEL, formatUnitsShort, monthLabel } from "@/components/savings/format"
import { useOs } from "@/components/os/os-shell"

const RANGES = [
  { label: "1Y", years: 1 },
  { label: "3Y", years: 3 },
  { label: "5Y", years: 5 },
  { label: "All", years: null },
] as const

/**
 * Savings at a glance. Month view logs the header month; year view shows what
 * the year added and asks which month to log.
 */
export function OsSavings() {
  const { year, month, period } = useOs()
  const model = useSavingsModel()
  const [range, setRange] = useState<number | null>(null)
  const [target, setTarget] = useState<TradeTarget | null>(null)
  const [picking, setPicking] = useState<Holding | null>(null)
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
  const shown = range === null ? series : series.filter((p) => p.monthIndex > todayIndex - range * 12)
  const tapHolding = (h: Holding) => {
    if (period === "year") {
      setPicking(h)
    } else {
      setTarget({ holding: h, year, month })
    }
  }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 min-[600px]:grid-cols-2">
      <div className="flex min-w-0 flex-col gap-4">
        <section className="bg-card ring-foreground/5 flex flex-col gap-1 p-4 shadow-sm ring-1">
          <span className="text-muted-foreground text-[11px] font-semibold tracking-widest uppercase">
            Worth now
          </span>
          <span className="text-4xl font-semibold tracking-tight tabular-nums">{kr(now?.value ?? 0)}</span>
          <span className={cn("text-sm font-medium tabular-nums", gain > 0 ? up : gain < 0 ? down : "text-muted-foreground")}>
            {signedKr(gain)} · {signedPct(rate)}
            <span className="text-muted-foreground font-normal"> on {kr(now?.paid ?? 0)} paid in</span>
          </span>
        </section>

        {period === "year" && <YearFigures year={year} series={series} results={results} trades={trades} todayIndex={todayIndex} />}

        {model.marketError && (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            Market prices didn&apos;t load — showing entered and purchase prices.
          </p>
        )}

        <section className="bg-card ring-foreground/5 flex flex-col gap-2 p-3 shadow-sm ring-1" data-no-swipe>
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground text-[11px] font-semibold tracking-widest uppercase">
              Worth vs put in
            </span>
            <div className="grid grid-cols-4 border">
              {RANGES.map((r) => (
                <button
                  key={r.label}
                  type="button"
                  onClick={() => setRange(r.years)}
                  className={cn(
                    "h-9 w-11 text-xs font-semibold",
                    range === r.years ? "bg-primary text-primary-foreground" : "text-muted-foreground active:bg-muted",
                  )}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
          <SavingsChart points={shown} height={200} />
        </section>
      </div>

      <div className="flex min-w-0 flex-col gap-4">
        {plans.map((r) => (
          <PlanCard key={r.holding.id} result={r} todayIndex={todayIndex} />
        ))}

        <section className="flex flex-col gap-2">
          <h2 className="text-muted-foreground px-1 text-[11px] font-semibold tracking-widest uppercase">
            Holdings · tap to log {period === "year" ? `a month in ${year}` : MONTHS_LONG[month - 1]}
          </h2>
          <ul className="bg-card ring-foreground/5 flex flex-col divide-y shadow-sm ring-1">
            {results.map((r) => (
              <li key={r.holding.id}>
                <button
                  type="button"
                  onClick={() => tapHolding(r.holding)}
                  className="active:bg-muted flex min-h-16 w-full items-center gap-3 px-3 py-2 text-left"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{r.holding.name}</span>
                    <span className="text-muted-foreground text-xs">
                      {KIND_LABEL[r.holding.kind]} · {formatUnitsShort(r.units)} units
                      {r.holding.symbol ? "" : " · prices by hand"}
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
      </div>

      <Sheet open={!!picking} onOpenChange={(o) => !o && setPicking(null)}>
        <SheetContent side="bottom">
          <SheetHeader>
            <SheetTitle>{picking?.name}</SheetTitle>
            <SheetDescription>Which month in {year}?</SheetDescription>
          </SheetHeader>
          <div className="grid grid-cols-4 gap-2 px-4 pb-6">
            {MONTHS_SHORT.map((label, i) => {
              const has = trades.some((t) => t.holding_id === picking?.id && t.year === year && t.month === i + 1)
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => {
                    if (picking) {
                      setTarget({ holding: picking, year, month: i + 1 })
                    }
                    setPicking(null)
                  }}
                  className={cn(
                    "active:bg-muted h-12 border text-sm font-medium",
                    has && "border-primary bg-primary/10",
                    monthIndexOf(year, i + 1) === todayIndex && "ring-foreground ring-1",
                  )}
                >
                  {label}
                </button>
              )
            })}
          </div>
        </SheetContent>
      </Sheet>

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

/** What the year added: money in, bonus shares, and growth that isn't your own deposits. */
function YearFigures({
  year,
  series,
  results,
  trades,
  todayIndex,
}: {
  year: number
  series: SavingsSeriesPoint[]
  results: HoldingResult[]
  trades: { year: number; side: string; amount: number }[]
  todayIndex: number
}) {
  const startIndex = monthIndexOf(year - 1, 12)
  const endIndex = Math.min(monthIndexOf(year, 12), todayIndex)
  const at = (i: number) => series.find((p) => p.monthIndex === i)
  // Missing end point: the year is before the first trade.
  const end = at(endIndex)
  if (endIndex <= startIndex || !end) {
    const planned = trades.filter((t) => t.year === year && t.side === "buy").reduce((s, t) => s + t.amount, 0)
    return (
      <section className="bg-card ring-foreground/5 flex flex-col gap-1 p-4 shadow-sm ring-1">
        <span className="text-muted-foreground text-[11px] font-semibold tracking-widest uppercase">{year}</span>
        <span className="text-sm">
          {planned
            ? `${kr(planned)} of purchases planned.`
            : endIndex <= startIndex
              ? "Nothing planned yet — tap a holding to add a purchase."
              : `Nothing put in during ${year}.`}
        </span>
      </section>
    )
  }
  const start = at(startIndex) ?? { paid: 0, received: 0, value: 0 }
  const putIn = end.paid - start.paid - (end.received - start.received)
  const growth = end.value - start.value - putIn
  const bonus = results
    .flatMap((r) => r.lots)
    .filter((l) => l.source === "bonus" && yearOf(l.monthIndex) === year && l.monthIndex <= todayIndex)
    .reduce((s, l) => s + l.bought, 0)
  return (
    <section className="bg-card ring-foreground/5 grid grid-cols-3 gap-3 p-4 shadow-sm ring-1">
      <Figure label={`Put in ${year}`} value={kr(putIn)} />
      <Figure label="Growth" value={signedKr(growth)} tone={growth > 0 ? up : growth < 0 ? down : undefined} hint="excl. your deposits" />
      <Figure label="Bonus shares" value={bonus ? `+${formatUnitsShort(bonus)}` : "—"} tone={bonus ? up : undefined} />
    </section>
  )
}

function Figure({ label, value, tone, hint }: { label: string; value: string; tone?: string; hint?: string }) {
  return (
    <div className="flex min-w-0 flex-col">
      <span className="text-muted-foreground truncate text-[11px] font-semibold tracking-widest uppercase">{label}</span>
      <span className={cn("truncate text-lg font-semibold tabular-nums", tone)}>{value}</span>
      {hint && <span className="text-muted-foreground text-[11px]">{hint}</span>}
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
    <section className="bg-card ring-foreground/5 flex flex-col gap-3 p-4 shadow-sm ring-1">
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
      <div data-no-swipe>
        <PlanTimeline lots={lots} todayIndex={todayIndex} />
      </div>
    </section>
  )
}
