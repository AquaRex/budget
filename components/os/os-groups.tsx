"use client"

import { useMemo } from "react"
import Link from "next/link"
import { ArrowUpRight } from "lucide-react"

import { computeGroupsMatrix, type GroupBand } from "@/lib/stats/groups"
import type { MonthStatus } from "@/lib/stats/types"
import { useStatsData, useToday } from "@/lib/stats/use-dashboard-stats"
import { MONTHS_LONG, MONTHS_SHORT } from "@/lib/budget"
import { cn } from "@/lib/utils"
import { Skeleton } from "@/components/ui/skeleton"
import { down, kr, signedKr, up } from "@/components/stats/display"
import { useOs } from "@/components/os/os-shell"
import {
  BudgetBar,
  SECTIONS,
  SectionTitle,
  verdict,
} from "@/components/os/os-groups-shared"
import { OsGroupsYear } from "@/components/os/os-groups-year"

/** Each group's month (or year to date): actual against budget, with a clear over/under. */
export function OsGroups() {
  const { year, month, period, setMonth, openMonth, stats } = useOs()
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
  const hasGroups = data.categories.some((c) => c.is_group)
  const monthBands = bands.filter(
    (b) => b.budget[i] !== 0 || b.actual[i] !== 0,
  )

  if (loading) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
      </div>
    )
  }

  if (period === "year") {
    return (
      <div className="flex min-w-0 flex-col gap-4">
        {bands.length === 0 ? (
          <NoGroups hasGroups={hasGroups} period={String(year)} />
        ) : (
          <OsGroupsYear
            year={year}
            bands={bands}
            statuses={statuses}
            openMonth={openMonth}
          />
        )}
        <WebsiteLink />
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
        const list = monthBands.filter((b) => b.kind === kind)
        if (list.length === 0) {
          return null
        }
        return (
          <section key={kind} className="flex min-w-0 flex-col gap-2">
            <SectionTitle>{title}</SectionTitle>
            <ul className="grid grid-cols-[minmax(0,1fr)] gap-2 min-[600px]:grid-cols-2">
              {list.map((b) => (
                <GroupCard
                  key={b.key}
                  band={b}
                  index={i}
                  inProgress={inProgress}
                  statuses={statuses}
                  currentIndex={currentIndex}
                  onPickMonth={setMonth}
                />
              ))}
            </ul>
          </section>
        )
      })}
      {monthBands.length === 0 && (
        <NoGroups
          hasGroups={hasGroups}
          period={`${MONTHS_LONG[i]} ${year}`}
        />
      )}
      <WebsiteLink />
    </div>
  )
}

function NoGroups({ hasGroups, period }: { hasGroups: boolean; period: string }) {
  return (
    <p className="text-muted-foreground py-16 text-center text-sm">
      {hasGroups ? `Nothing budgeted or spent in ${period}.` : "No groups yet."}
    </p>
  )
}

function WebsiteLink() {
  return (
    <Link
      href="/groups"
      className="text-muted-foreground flex min-h-11 items-center justify-center gap-2 text-xs"
    >
      <ArrowUpRight className="size-4" aria-hidden /> Full year grid on the
      website
    </Link>
  )
}

function GroupCard({
  band,
  index,
  inProgress,
  statuses,
  currentIndex,
  onPickMonth,
}: {
  band: GroupBand
  index: number
  inProgress: boolean
  statuses: MonthStatus[]
  currentIndex: number // month in progress (pending income/savings isn't a shortfall yet)
  onPickMonth: (month: number) => void
}) {
  const actual = band.actual[index]
  const budget = band.budget[index]
  const diff = band.diff[index]
  const good = diff >= 0
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
      <BudgetBar kind={band.kind} actual={actual} budget={budget} />
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
              <button
                key={m}
                type="button"
                title={`${MONTHS_SHORT[m]}: ${d == null ? "—" : signedKr(d)}`}
                aria-label={`${MONTHS_LONG[m]}: ${d == null ? "no verdict" : `${signedKr(d)} vs budget`}`}
                aria-current={m === index ? "date" : undefined}
                onClick={() => onPickMonth(m + 1)}
                className={cn(
                  "active:bg-muted relative flex-1",
                  m === index && "bg-muted",
                )}
              >
                {d != null && d !== 0 && (
                  <span
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
                <span className="bg-border absolute inset-x-0 top-1/2 h-px" />
              </button>
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
