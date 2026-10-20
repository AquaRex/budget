"use client"

import type { DayStat } from "@/lib/stats/types"
import { MONTHS_LONG, MONTHS_SHORT } from "@/lib/budget"
import { cn } from "@/lib/utils"
import {
  compact,
  formatShortDate,
  kr,
  up,
  type HeatScale,
} from "@/components/stats/display"

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"]

export type HeatDay = DayStat & { covered: boolean }

type Props = {
  days: HeatDay[] // the days of one month, in order
  scale: HeatScale
  today: string
  selected?: string | null
  onSelectDay?: (date: string) => void
}

function cellLead(date: string): number {
  const [y, m] = date.split("-").map(Number)
  return (new Date(y, m - 1, 1).getDay() + 6) % 7
}

function dayTitle(d: HeatDay): string {
  if (!d.covered) {
    return `${formatShortDate(d.date)}: no data`
  }
  if (d.spent < 0) {
    return `${formatShortDate(d.date)}: net refund ${kr(-d.spent)}`
  }
  return `${formatShortDate(d.date)}: ${kr(d.spent)} spent${d.txCount ? ` · ${d.txCount} tx` : ""}`
}

// Refunds outweighed spending: distinct from a plain no-spend day.
const refundRing = "text-foreground ring-1 ring-inset ring-(--viz-income)"

function cellClass(d: HeatDay, bucket: number) {
  if (!d.covered) {
    return "viz-no-data bg-transparent text-muted-foreground/60 ring-1 ring-inset ring-border"
  }
  if (d.spent < 0) {
    return refundRing
  }
  if (bucket === 5) {
    return "text-(--heat-ink-hi)"
  }
  return bucket === 4
    ? "text-foreground dark:text-(--heat-ink-hi)"
    : "text-foreground"
}

/** One month as a weekday-aligned calendar; colour = spend bucket. */
export function MonthHeatmap({
  days,
  scale,
  today,
  selected,
  onSelectDay,
  variant = "large",
}: Props & { variant?: "large" | "compact" }) {
  if (days.length === 0) {
    return null
  }
  const lead = cellLead(days[0].date)
  const large = variant === "large"

  return (
    <div className="flex flex-col gap-1">
      <div className="grid grid-cols-7 gap-[3px]">
        {WEEKDAYS.map((w, i) => (
          <div
            key={i}
            className="text-muted-foreground text-center text-[10px] font-medium tracking-widest"
          >
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-[3px]">
        {Array.from({ length: lead }, (_, i) => (
          <div key={`lead-${i}`} />
        ))}
        {days.map((d) => {
          const bucket = d.covered ? scale.bucket(d.spent) : 0
          const day = Number(d.date.slice(8, 10))
          return (
            <button
              key={d.date}
              type="button"
              disabled={!onSelectDay}
              onClick={() => onSelectDay?.(d.date)}
              title={dayTitle(d)}
              aria-label={dayTitle(d)}
              style={
                d.covered ? { background: `var(--heat-${bucket})` } : undefined
              }
              className={cn(
                "relative flex flex-col justify-between overflow-hidden p-1 text-left transition-[transform,box-shadow] duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-95 disabled:cursor-default",
                large
                  ? "min-h-14 sm:min-h-16"
                  : "h-11 items-center justify-center",
                cellClass(d, bucket),
                d.date === today && "ring-2 ring-foreground ring-inset",
                selected === d.date && "ring-primary ring-2 ring-inset",
              )}
            >
              <span
                className={cn(
                  "leading-none tabular-nums",
                  large
                    ? "text-[11px] font-medium opacity-80"
                    : "text-xs font-medium",
                )}
              >
                {day}
              </span>
              {large && d.covered && d.spent !== 0 && (
                <span
                  className={cn(
                    "self-end text-[11px] leading-none font-semibold tabular-nums sm:text-xs",
                    d.spent < 0 && up,
                  )}
                >
                  {d.spent < 0 ? `+${compact(-d.spent)}` : compact(d.spent)}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** The whole year: twelve small weekday-aligned months. */
export function YearHeatmap({
  months,
  scale,
  today,
  selected,
  onSelectDay,
  onSelectMonth,
}: {
  months: HeatDay[][] // 12 entries, each the days of that month
} & Omit<Props, "days"> & { onSelectMonth?: (month: number) => void }) {
  return (
    <div className="grid grid-cols-2 gap-x-5 gap-y-5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
      {months.map((days, i) => {
        const total = days.reduce((s, d) => s + (d.covered ? d.spent : 0), 0)
        const anyCovered = days.some((d) => d.covered)
        const lead = days.length ? cellLead(days[0].date) : 0
        return (
          <div key={i} className="flex flex-col gap-1.5">
            <button
              type="button"
              disabled={!onSelectMonth}
              onClick={() => onSelectMonth?.(i + 1)}
              className="hover:text-foreground flex min-h-11 items-center justify-between text-left disabled:cursor-default sm:min-h-8"
              title={onSelectMonth ? `Open ${MONTHS_LONG[i]}` : undefined}
            >
              <span className="text-xs font-semibold tracking-widest uppercase">
                {MONTHS_SHORT[i]}
              </span>
              <span className="text-muted-foreground text-[11px] tabular-nums">
                {anyCovered ? kr(total) : "—"}
              </span>
            </button>
            <div className="grid grid-cols-7 gap-[2px]">
              {Array.from({ length: lead }, (_, j) => (
                <div key={`lead-${j}`} />
              ))}
              {days.map((d) => {
                const bucket = d.covered ? scale.bucket(d.spent) : 0
                return (
                  <button
                    key={d.date}
                    type="button"
                    disabled={!onSelectDay}
                    onClick={() => onSelectDay?.(d.date)}
                    title={dayTitle(d)}
                    aria-label={dayTitle(d)}
                    style={
                      d.covered
                        ? { background: `var(--heat-${bucket})` }
                        : undefined
                    }
                    className={cn(
                      "aspect-square outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default",
                      !d.covered && "viz-no-data ring-border ring-1 ring-inset",
                      d.covered && d.spent < 0 && refundRing,
                      d.date === today && "ring-foreground ring-2 ring-inset",
                      selected === d.date && "ring-primary ring-2 ring-inset",
                    )}
                  />
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/** Legend: quantile buckets with their ranges, plus no-spend and no-data swatches. */
export function HeatLegend({
  scale,
  compact: short = false,
  className,
}: {
  scale: HeatScale
  compact?: boolean
  className?: string
}) {
  const [a, b, c, d] = scale.thresholds
  const ranges = [
    `≤ ${kr(a)}`,
    `≤ ${kr(b)}`,
    `≤ ${kr(c)}`,
    `≤ ${kr(d)}`,
    `> ${kr(d)}`,
  ]
  return (
    <div
      className={cn(
        "text-muted-foreground flex flex-wrap items-center gap-y-2 text-[11px]",
        short ? "gap-x-3" : "gap-x-4",
        className,
      )}
    >
      <span className="flex items-center gap-1.5">
        <span className={cn(short && "sr-only")}>Less</span>
        {[1, 2, 3, 4, 5].map((i) => (
          <span
            key={i}
            className="size-3"
            style={{ background: `var(--heat-${i})` }}
            title={ranges[i - 1]}
          />
        ))}
        <span className={cn(short && "sr-only")}>More</span>
      </span>
      <span className="flex items-center gap-1.5">
        <span className="size-3" style={{ background: "var(--heat-0)" }} /> No
        spend
      </span>
      <span className="flex items-center gap-1.5">
        <span className="viz-no-data ring-border size-3 ring-1 ring-inset" /> No
        data
      </span>
      <span className="flex items-center gap-1.5">
        <span className="size-3 ring-1 ring-(--viz-income) ring-inset" /> Net
        refund
      </span>
      <span className={cn("tabular-nums", short && "hidden")}>
        Buckets: {compact(a)} · {compact(b)} · {compact(c)} · {compact(d)} kr
      </span>
    </div>
  )
}
