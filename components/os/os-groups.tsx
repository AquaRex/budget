"use client"

import { useMemo } from "react"
import Link from "next/link"
import { ArrowUpRight } from "lucide-react"

import {
  computeGroupsMatrix,
  type GroupBand,
  type GroupKind,
} from "@/lib/stats/groups"
import type { MonthStatus } from "@/lib/stats/types"
import { useStatsData, useToday } from "@/lib/stats/use-dashboard-stats"
import { MONTHS_SHORT } from "@/lib/budget"
import { cn } from "@/lib/utils"
import { Skeleton } from "@/components/ui/skeleton"
import { down, kr, up } from "@/components/stats/display"
import { useOs } from "@/components/os/os-shell"

const SECTIONS: { kind: GroupKind; title: string }[] = [
  { kind: "bill", title: "Spending groups" },
  { kind: "savings", title: "Set aside" },
  { kind: "income", title: "Income" },
]

/** How the difference reads for each kind; + is always good. */
function verdict(kind: GroupKind, diff: number, inProgress: boolean): string {
  const amount = kr(Math.abs(diff))
  if (Math.round(diff) === 0) {
    return "on budget"
  }
  if (kind === "bill") {
    if (diff > 0) {
      return inProgress ? `${amount} left` : `${amount} under`
    }
    return `${amount} over`
  }
  if (kind === "savings") {
    return diff > 0
      ? `${amount} extra`
      : inProgress
        ? `${amount} to go`
        : `${amount} short`
  }
  return diff > 0
    ? `${amount} more`
    : inProgress
      ? `${amount} to come`
      : `${amount} short`
}

/** Each group's month: actual against budget, with a clear over/under. */
export function OsGroups() {
  const { year, month, stats } = useOs()
  const { data, loading } = useStatsData()
  const today = useToday()
  const { months: statuses, bands } = useMemo(
    () => computeGroupsMatrix(data, year, today),
    [data, year, today],
  )
  const i = month - 1
  const status = stats.months[i]?.status
  const inProgress = status === "current"
  const currentIndex = statuses.indexOf("current")

  if (loading) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
      </div>
    )
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {inProgress && (
        <p className="text-muted-foreground text-xs">
          Month in progress — amounts are so far, budgets are for the whole
          month.
        </p>
      )}
      {SECTIONS.map(({ kind, title }) => {
        const list = bands.filter(
          (b) => b.kind === kind && (b.budget[i] !== 0 || b.actual[i] !== 0),
        )
        if (list.length === 0) {
          return null
        }
        return (
          <section key={kind} className="flex min-w-0 flex-col gap-2">
            <h2 className="text-muted-foreground px-1 text-[11px] font-semibold tracking-widest uppercase">
              {title}
            </h2>
            <ul className="grid grid-cols-[minmax(0,1fr)] gap-2 min-[600px]:grid-cols-2">
              {list.map((b) => (
                <GroupCard
                  key={b.key}
                  band={b}
                  index={i}
                  inProgress={inProgress}
                  statuses={statuses}
                  currentIndex={currentIndex}
                />
              ))}
            </ul>
          </section>
        )
      })}
      {bands.length === 0 && (
        <p className="text-muted-foreground py-16 text-center text-sm">
          No groups yet.
        </p>
      )}
      <Link
        href="/groups"
        className="text-muted-foreground flex min-h-11 items-center justify-center gap-2 text-xs"
      >
        <ArrowUpRight className="size-4" aria-hidden /> Full year grid on the
        website
      </Link>
    </div>
  )
}

function GroupCard({
  band,
  index,
  inProgress,
  statuses,
  currentIndex,
}: {
  band: GroupBand
  index: number
  inProgress: boolean
  statuses: MonthStatus[]
  currentIndex: number // month in progress (pending income/savings isn't a shortfall yet)
}) {
  const actual = band.actual[index]
  const budget = band.budget[index]
  const diff = band.diff[index]
  const max = Math.max(actual, budget, 1)
  const good = diff >= 0
  // Spending reads neutral while within budget; only the overspend is rose.
  const within =
    band.kind === "bill" && budget > 0
      ? Math.min(Math.max(0, actual), budget)
      : Math.max(0, actual)
  const over =
    band.kind === "bill" && budget > 0 ? Math.max(0, actual - budget) : 0
  const bar = band.kind === "bill" ? "bg-foreground/35" : "bg-(--viz-income)"
  // Only fully imported months (and the current one) are judged; partial,
  // no-data and future months stay blank rather than show a fake verdict.
  const strip = band.diff.map((d, m) =>
    statuses[m] === "complete" || statuses[m] === "current" ? d : null,
  )
  const stripMax = Math.max(...strip.map((d) => Math.abs(d ?? 0)), 1)

  return (
    <li className="bg-card ring-foreground/5 flex min-w-0 flex-col gap-2 p-3 shadow-sm ring-1">
      <div className="flex min-w-0 items-baseline justify-between gap-3">
        <span className="truncate text-sm font-semibold">{band.name}</span>
        <span className="shrink-0 text-sm tabular-nums">
          <span className="font-semibold">{kr(actual)}</span>
          {band.hasBudget && (
            <span className="text-muted-foreground"> of {kr(budget)}</span>
          )}
        </span>
      </div>
      <div className="bg-muted relative h-2">
        <div
          className={cn(
            "absolute inset-y-0 left-0 transition-[width] duration-500 motion-reduce:transition-none",
            bar,
          )}
          style={{ width: `${(within / max) * 100}%` }}
        />
        {over > 0 && (
          <div
            className="absolute inset-y-0 bg-(--viz-spent)"
            style={{
              left: `${(budget / max) * 100}%`,
              width: `${(over / max) * 100}%`,
            }}
          />
        )}
        {budget > 0 && (
          <div
            className="bg-primary absolute -inset-y-1 w-1"
            style={{ left: `calc(${(budget / max) * 100}% - 2px)` }}
          />
        )}
      </div>
      {band.hasBudget ? (
        <span
          className={cn(
            "text-xs font-medium tabular-nums",
            // Mid-month, income or savings not in yet is pending, not bad.
            good
              ? up
              : inProgress && band.kind !== "bill"
                ? "text-muted-foreground"
                : down,
          )}
        >
          {verdict(band.kind, diff, inProgress)}
        </span>
      ) : (
        <span className="text-muted-foreground text-xs">
          No budget for this group
        </span>
      )}
      {band.hasBudget && (
        <div
          className="hidden flex-col gap-1 min-[600px]:flex"
          aria-label="Difference to budget per month"
        >
          <div className="flex h-10 items-stretch gap-[2px]">
            {strip.map((d, m) => (
              <div
                key={m}
                title={`${MONTHS_SHORT[m]}: ${d == null ? "—" : `${d >= 0 ? "+" : "−"}${kr(Math.abs(d))}`}`}
                className={cn("relative flex-1", m === index && "bg-muted")}
              >
                {d != null && d !== 0 && (
                  <div
                    className={cn(
                      "absolute inset-x-0",
                      d > 0
                        ? "bottom-1/2 bg-(--viz-income)"
                        : m === currentIndex && band.kind !== "bill"
                          ? "bg-muted-foreground/50 top-1/2"
                          : "top-1/2 bg-(--viz-spent)",
                    )}
                    style={{ height: `${(Math.abs(d) / stripMax) * 50}%` }}
                  />
                )}
                <div className="bg-border absolute inset-x-0 top-1/2 h-px" />
              </div>
            ))}
          </div>
          <div className="text-muted-foreground flex justify-between text-[9px] tracking-widest uppercase">
            <span>Jan</span>
            <span>vs budget per month</span>
            <span>Dec</span>
          </div>
        </div>
      )}
    </li>
  )
}
