"use client"

import type { GroupBand, GroupKind } from "@/lib/stats/groups"
import type { MonthStatus } from "@/lib/stats/types"
import { MONTHS_LONG, MONTHS_SHORT } from "@/lib/budget"
import { cn } from "@/lib/utils"
import { down, kr, pct, signedKr, up } from "@/components/stats/display"
import { diffFill, diffLevel } from "@/components/groups/diff-heat"
import {
  BudgetBar,
  SECTIONS,
  SectionTitle,
  verdict,
} from "@/components/os/os-groups-shared"

type YearContext = {
  statuses: MonthStatus[]
  settledCount: number
  current: number // index of the month in progress, -1 when none
  notStarted: boolean
  openMonth: (month: number) => void
}

const sum = (values: number[]) => values.reduce((s, v) => s + v, 0)

function actualToDate(band: GroupBand, statuses: MonthStatus[]): number {
  return sum(band.actual.filter((_, i) => statuses[i] === "complete"))
}

/** Settled part of the month in progress: overspend already gone, or money already in. */
function settledNow(band: GroupBand, current: number): number {
  if (current < 0) {
    return 0
  }
  const d = band.diff[current]
  return band.kind === "bill" ? Math.min(0, d) : Math.max(0, d)
}

/** Each group's year to date against its budget to date, with a month strip to drill into. */
export function OsGroupsYear({
  year,
  bands,
  statuses,
  openMonth,
}: {
  year: number
  bands: GroupBand[]
  statuses: MonthStatus[]
  openMonth: (month: number) => void
}) {
  const ctx: YearContext = {
    statuses,
    settledCount: statuses.filter((s) => s === "complete").length,
    current: statuses.indexOf("current"),
    notStarted: statuses.every((s) => s === "future"),
    openMonth,
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <YearSummary year={year} bands={bands} ctx={ctx} />
      {SECTIONS.map(({ kind, title }) => {
        const list = bands.filter((b) => b.kind === kind)
        if (list.length === 0) {
          return null
        }
        return (
          <section key={kind} className="flex min-w-0 flex-col gap-2">
            <SectionTitle>{title}</SectionTitle>
            <ul className="grid grid-cols-[minmax(0,1fr)] gap-2 min-[600px]:grid-cols-2">
              {list.map((b) => (
                <YearCard key={b.key} band={b} ctx={ctx} />
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}

function YearSummary({
  year,
  bands,
  ctx,
}: {
  year: number
  bands: GroupBand[]
  ctx: YearContext
}) {
  const { statuses, settledCount, current, notStarted } = ctx
  const lastSettled = statuses.lastIndexOf("complete")
  const budgeted = (kind: GroupKind) =>
    bands.filter((b) => b.kind === kind && b.hasBudget)
  const bills = budgeted("bill")
  const billDiff = sum(bills.map((b) => b.diffToDate))
  const over = bills
    .filter((b) => Math.round(b.diffToDate) < 0)
    .sort((a, b) => a.diffToDate - b.diffToDate)
  const unassigned = sum(
    bands.filter((b) => !b.hasBudget).map((b) => actualToDate(b, statuses)),
  )
  const judged = settledCount > 0 || Math.round(billDiff) !== 0

  const title = notStarted
    ? `${year} budget`
    : settledCount === 12
      ? `${year} full year`
      : `${year} so far`
  const subtitle = notStarted
    ? "Not started yet — budgets only"
    : [
        settledCount > 0
          ? `${settledCount} complete month${settledCount === 1 ? "" : "s"}, through ${MONTHS_SHORT[lastSettled]}`
          : "No complete months yet",
        current >= 0 && `${MONTHS_SHORT[current]} in progress: only settled amounts count`,
      ]
        .filter(Boolean)
        .join(" · ")

  const figures = notStarted
    ? SECTIONS.map(({ kind, title }) => ({
        label: title,
        value: kr(sum(budgeted(kind).map((b) => b.budgetTotal))),
        tone: "",
      }))
    : [
        ...(["savings", "income"] as const)
          .filter((kind) => budgeted(kind).length > 0)
          .map((kind) => {
            const value = sum(budgeted(kind).map((b) => b.diffToDate))
            return {
              label: kind === "savings" ? "Set aside vs plan" : "Income vs plan",
              value: signedKr(value),
              tone: Math.round(value) === 0 ? "" : value > 0 ? up : down,
            }
          }),
        {
          label: "Groups over",
          value: `${over.length} / ${bills.length}`,
          tone: over.length > 0 ? down : up,
        },
        ...(unassigned > 0
          ? [{ label: "Unassigned spend", value: kr(unassigned), tone: "" }]
          : []),
      ]

  return (
    <section className="bg-card ring-foreground/5 flex min-w-0 flex-col gap-3 p-3 shadow-sm ring-1">
      <div className="flex min-w-0 flex-col">
        <span className="text-sm font-semibold">{title}</span>
        <span className="text-muted-foreground text-[11px]">{subtitle}</span>
      </div>

      {!notStarted && (
        <div className="flex min-w-0 flex-col">
          <span className="text-muted-foreground text-xs font-medium">
            Spending groups vs budget to date
          </span>
          <span
            className={cn(
              "text-2xl font-semibold tracking-tight tabular-nums",
              judged && Math.round(billDiff) !== 0 && (billDiff > 0 ? up : down),
            )}
          >
            {judged ? verdict("bill", billDiff, false) : "—"}
          </span>
        </div>
      )}

      <dl className="grid grid-cols-3 gap-3">
        {figures.map((f) => (
          <div key={f.label} className="flex min-w-0 flex-col gap-0.5">
            <dt className="text-muted-foreground truncate text-[11px] font-medium">
              {f.label}
            </dt>
            <dd
              className={cn(
                "truncate text-sm font-semibold tabular-nums",
                f.tone,
              )}
            >
              {f.value}
            </dd>
          </div>
        ))}
      </dl>

      {!notStarted && judged && (
        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground text-[11px] font-semibold tracking-widest uppercase">
            Furthest over
          </span>
          {over.length === 0 ? (
            <p className="text-sm">Every spending group is on or under budget.</p>
          ) : (
            <ol className="flex flex-col divide-y border-y">
              {over.slice(0, 3).map((b) => (
                <li key={b.key}>
                  <a
                    href={`#group-${b.key}`}
                    className="active:bg-muted flex min-h-11 items-center justify-between gap-3"
                  >
                    <span className="truncate text-sm font-medium">
                      {b.name}
                    </span>
                    <span className="flex shrink-0 items-baseline gap-2 tabular-nums">
                      {b.budgetToDate > 0 && (
                        <span className="text-muted-foreground text-[11px]">
                          {pct(-b.diffToDate / b.budgetToDate)} over
                        </span>
                      )}
                      <span className={cn("text-sm font-semibold", down)}>
                        {signedKr(b.diffToDate)}
                      </span>
                    </span>
                  </a>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}

      <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px]">
        <span className="flex items-center gap-1">
          over
          <span className="flex">
            {[4, 3, 2, 1].map((l) => (
              <span
                key={`bad-${l}`}
                className="size-2.5"
                style={{ backgroundColor: `var(--diff-bad-${l})` }}
              />
            ))}
            <span className="bg-muted size-2.5" />
            {[1, 2, 3, 4].map((l) => (
              <span
                key={`good-${l}`}
                className="size-2.5"
                style={{ backgroundColor: `var(--diff-good-${l})` }}
              />
            ))}
          </span>
          under
        </span>
        <span className="flex items-center gap-1">
          <span className="viz-no-data size-2.5 border" /> not imported
        </span>
        <span>Tap a month to open it</span>
      </div>
    </section>
  )
}

function YearCard({ band, ctx }: { band: GroupBand; ctx: YearContext }) {
  const { statuses, settledCount, current, notStarted } = ctx
  const actual = actualToDate(band, statuses)
  const budget = band.budgetToDate
  const diff = band.diffToDate
  const now = settledNow(band, current)
  const judged = settledCount > 0 || Math.round(now) !== 0
  const showNow =
    current >= 0 && (band.actual[current] !== 0 || band.budget[current] !== 0)

  return (
    <li
      id={`group-${band.key}`}
      className="bg-card ring-foreground/5 flex min-w-0 scroll-mt-20 flex-col gap-2 p-3 shadow-sm ring-1"
    >
      <div className="flex min-w-0 items-baseline justify-between gap-3">
        <span className="truncate text-sm font-semibold">{band.name}</span>
        <span className="shrink-0 text-sm tabular-nums">
          {notStarted ? (
            <span className="text-muted-foreground">
              {kr(band.budgetTotal)} budget
            </span>
          ) : (
            <>
              <span className="font-semibold">{kr(actual)}</span>
              {band.hasBudget && (
                <span className="text-muted-foreground"> of {kr(budget)}</span>
              )}
            </>
          )}
        </span>
      </div>
      {!notStarted && (
        <BudgetBar kind={band.kind} actual={actual} budget={budget} />
      )}
      <div className="flex min-w-0 items-baseline justify-between gap-3">
        {notStarted ? (
          <span className="text-muted-foreground text-xs">Not started</span>
        ) : !band.hasBudget ? (
          <span className="text-muted-foreground text-xs">
            No budget for this group
          </span>
        ) : !judged ? (
          <span className="text-muted-foreground text-xs">
            No complete months yet
          </span>
        ) : (
          <span
            className={cn(
              "text-xs font-medium tabular-nums",
              Math.round(diff) === 0 ? "" : diff > 0 ? up : down,
            )}
          >
            {verdict(band.kind, diff, false)}
          </span>
        )}
        {!notStarted && band.hasBudget && budget > 0 && (
          <span className="text-muted-foreground text-[11px] tabular-nums">
            {pct(actual / budget)} of budget
          </span>
        )}
      </div>
      {showNow && (
        <span className="text-muted-foreground text-[11px] tabular-nums">
          {MONTHS_SHORT[current]} so far: {kr(band.actual[current])}
          {band.hasBudget && ` of ${kr(band.budget[current])}`}
          {band.hasBudget && Math.round(now) !== 0 && (
            <span className={now > 0 ? up : down}>
              {" "}
              · {verdict(band.kind, now, false)} already, counted above
            </span>
          )}
        </span>
      )}
      <MonthStrip band={band} ctx={ctx} />
    </li>
  )
}

function MonthStrip({ band, ctx }: { band: GroupBand; ctx: YearContext }) {
  const { statuses, current, openMonth } = ctx

  const cell = (m: number) => {
    const status = statuses[m]
    const d = band.diff[m]
    const name = MONTHS_LONG[m]
    if (status === "future") {
      return { fill: undefined, className: "bg-muted/50", label: `${name}: not started` }
    }
    if (status === "partial" || status === "no-data") {
      return { fill: undefined, className: "viz-no-data", label: `${name}: not fully imported` }
    }
    if (!band.hasBudget) {
      return {
        fill: undefined,
        className: band.actual[m] !== 0 ? "bg-muted-foreground/25" : "bg-muted",
        label: `${name}: ${kr(band.actual[m])} spent`,
      }
    }
    const judged = status === "current" ? settledNow(band, current) : d
    const fill = diffFill(diffLevel(judged, band.budget[m], band.budgetAvg), judged)
    const label =
      status === "current"
        ? `${name}: in progress, ${kr(band.actual[m])} so far`
        : `${name}: ${signedKr(d)} vs budget`
    return { fill, className: fill ? "" : "bg-muted", label }
  }

  return (
    <div className="flex gap-[2px]" aria-label="Difference to budget per month">
      {statuses.map((status, m) => {
        const c = cell(m)
        return (
          <button
            key={m}
            type="button"
            title={c.label}
            aria-label={`${c.label}. Open month`}
            onClick={() => openMonth(m + 1)}
            className={cn(
              "text-foreground/60 flex h-11 min-w-0 flex-1 items-end justify-center pb-1 text-[10px] font-medium active:opacity-70",
              c.className,
              status === "current" && "ring-foreground/70 ring-1 ring-inset",
            )}
            style={{ backgroundColor: c.fill }}
          >
            {MONTHS_SHORT[m][0]}
          </button>
        )
      })}
    </div>
  )
}
