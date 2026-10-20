"use client"

import { TrendingDown, TrendingUp, Minus } from "lucide-react"

import type { MonthStatus, SpendingPace } from "@/lib/stats/types"
import { dayLabel } from "@/lib/format"
import { cn } from "@/lib/utils"
import {
  down,
  formatShortDate,
  kr,
  signedPct,
  up,
} from "@/components/stats/display"

const ON_PACE = 0.03

export function paceTone(pace: SpendingPace): "good" | "bad" | "even" {
  if (pace.deltaPct == null || Math.abs(pace.deltaPct) < ON_PACE) {
    return "even"
  }
  return pace.deltaToDate > 0 ? "bad" : "good"
}

/** Spent so far vs the typical cumulative spend by the same day. */
export function PaceSummary({
  pace,
  status,
  dataThrough,
  size = "default",
}: {
  pace: SpendingPace
  status: MonthStatus
  dataThrough: string | null
  size?: "default" | "lg"
}) {
  if (status === "future" || status === "no-data") {
    return (
      <p className="text-muted-foreground py-4 text-sm">
        {status === "future"
          ? "This month hasn't started yet."
          : "No bank data for this month."}
      </p>
    )
  }
  if (pace.dayOfMonth === 0) {
    return (
      <div className="flex flex-col gap-1 py-2">
        <span className="text-3xl font-semibold tracking-tight">{kr(0)}</span>
        <p className="text-muted-foreground text-xs">
          Not imported yet
          {dataThrough ? ` · data through ${formatShortDate(dataThrough)}` : ""}
          . A typical month is {kr(pace.avgFullMonth)}.
        </p>
      </div>
    )
  }
  if (pace.lookbackMonths === 0) {
    return (
      <div className="flex flex-col gap-1 py-2">
        <span className="text-3xl font-semibold tracking-tight">
          {kr(pace.spentToDate)}
        </span>
        <p className="text-muted-foreground text-xs">
          Spent so far. Pace needs at least one complete month of history.
        </p>
      </div>
    )
  }

  const tone = paceTone(pace)
  const early = pace.deltaPct == null
  const finished = pace.dayOfMonth >= pace.daysInMonth
  const typicalLabel = `Typical by the ${dayLabel(pace.dayOfMonth)}`
  const max = Math.max(pace.avgFullMonth, pace.projected, pace.spentToDate, 1)
  const at = (v: number) => `${Math.min(100, (v / max) * 100)}%`
  const Icon =
    tone === "bad" ? TrendingUp : tone === "good" ? TrendingDown : Minus
  const verdict = early
    ? "Too early in the month to call"
    : tone === "even"
      ? "On your usual pace"
      : `${tone === "bad" ? "Faster" : "Slower"} than usual`

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-end justify-between gap-3">
        <div className="flex flex-col">
          <span
            className={cn(
              "font-semibold tracking-tight",
              size === "lg" ? "text-5xl" : "text-4xl",
              tone === "bad" ? down : tone === "good" ? up : "text-foreground",
            )}
          >
            {early ? kr(pace.spentToDate) : signedPct(pace.deltaPct)}
          </span>
          <span className="text-muted-foreground mt-1 flex items-center gap-1 text-xs font-medium">
            <Icon className="size-3.5" aria-hidden />
            {verdict}
          </span>
        </div>
        {!early && (
          <div className="text-right">
            <div className="text-lg font-semibold tabular-nums">
              {kr(pace.spentToDate)}
            </div>
            <div className="text-muted-foreground text-[11px]">
              {finished
                ? "spent this month"
                : `spent by the ${dayLabel(pace.dayOfMonth)}`}
            </div>
          </div>
        )}
      </div>

      <div className="relative h-2.5" aria-hidden>
        <div className="bg-muted absolute inset-0" />
        <div
          className={cn(
            "absolute inset-y-0 left-0 transition-[width] duration-700 ease-out motion-reduce:transition-none",
            tone === "bad" ? "bg-(--viz-spent)" : "bg-(--viz-income)",
          )}
          style={{ width: at(pace.spentToDate) }}
        />
        {!finished && (
          <div
            className="bg-foreground/25 absolute inset-y-0 left-0"
            style={{
              left: at(pace.spentToDate),
              width: `calc(${at(pace.projected)} - ${at(pace.spentToDate)})`,
            }}
          />
        )}
        <div
          className="bg-foreground absolute -inset-y-1 w-0.5"
          style={{ left: at(pace.avgToDate) }}
          title={typicalLabel}
        />
      </div>

      <dl className="grid grid-cols-3 gap-2 text-[11px]">
        <div>
          <dt className="text-muted-foreground">{typicalLabel}</dt>
          <dd className="text-sm font-medium tabular-nums">
            {kr(pace.avgToDate)}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Difference</dt>
          <dd
            className={cn(
              "text-sm font-medium tabular-nums",
              tone === "bad" ? down : tone === "good" ? up : "",
            )}
          >
            {pace.deltaToDate > 0 ? "+" : pace.deltaToDate < 0 ? "−" : ""}
            {kr(Math.abs(pace.deltaToDate))}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">
            {finished ? "Months compared" : "Projected"}
          </dt>
          <dd className="text-sm font-medium tabular-nums">
            {finished ? pace.lookbackMonths : kr(pace.projected)}
          </dd>
        </div>
      </dl>
    </div>
  )
}
