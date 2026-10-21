"use client"

import { MONTHS_SHORT } from "@/lib/budget"
import type { GroupBand, GroupKind } from "@/lib/stats/groups"
import type { MonthStatus } from "@/lib/stats/types"
import { cn } from "@/lib/utils"
import { Panel } from "@/components/stats/panel"
import { down, kr, pct, signedKr, up } from "@/components/stats/display"
import { diffLevel, isSettled } from "@/components/groups/diff-heat"

/** Year-to-date verdict over fully imported months only. */
export function GroupsSummary({
  bands,
  statuses,
  year,
}: {
  bands: GroupBand[]
  statuses: MonthStatus[]
  year: string
}) {
  const settled = statuses.map(isSettled)
  const settledCount = settled.filter(Boolean).length
  const lastSettled = settled.lastIndexOf(true)

  const rows = bands
    .filter((b) => b.hasBudget)
    .map((band) => {
      let diff = 0
      let budget = 0
      let monthsOver = 0
      band.diff.forEach((d, i) => {
        if (!settled[i]) {
          return
        }
        diff += d
        budget += band.budget[i]
        if (d < 0 && diffLevel(d, band.budget[i], band.budgetAvg) > 0) {
          monthsOver++
        }
      })
      return { band, diff, budget, monthsOver }
    })
  const unassigned = bands
    .filter((b) => !b.hasBudget)
    .reduce(
      (s, b) => s + b.actual.reduce((t, v, i) => (settled[i] ? t + v : t), 0),
      0,
    )

  const byKind = (kind: GroupKind) => rows.filter((r) => r.band.kind === kind)
  const net = (list: typeof rows) => list.reduce((s, r) => s + r.diff, 0)
  const bills = byKind("bill")
  const over = bills.filter((r) => r.diff < 0)
  const overruns = [...over].sort((a, b) => a.diff - b.diff).slice(0, 3)

  const figures = [
    { kind: "bill" as GroupKind, label: "Bills vs budget", good: "less", bad: "more" },
    { kind: "income" as GroupKind, label: "Income vs plan", good: "more", bad: "less" },
    { kind: "savings" as GroupKind, label: "Savings vs plan", good: "more", bad: "less" },
  ]
    .filter((f) => byKind(f.kind).length > 0)
    .map((f) => {
      const value = net(byKind(f.kind))
      return {
        label: f.label,
        value: signedKr(value),
        tone: value === 0 ? "" : value > 0 ? up : down,
        hint:
          value === 0
            ? "On plan"
            : `${value > 0 ? f.good : f.bad} than planned`,
      }
    })

  return (
    <Panel
      title={`${year} so far`}
      subtitle={
        settledCount > 0
          ? `${settledCount} complete month${settledCount === 1 ? "" : "s"}, through ${MONTHS_SHORT[lastSettled]} · + is always better than budget`
          : undefined
      }
    >
      {settledCount === 0 ? (
        <p className="text-muted-foreground text-sm">
          No fully imported months in {year} yet — the verdict starts once a
          month&apos;s bank data is complete.
        </p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-4 lg:grid-cols-2">
            {figures.map((f) => (
              <div key={f.label} className="flex min-w-0 flex-col gap-0.5">
                <dt className="text-muted-foreground text-xs font-medium">
                  {f.label}
                </dt>
                <dd
                  className={cn(
                    "truncate text-2xl font-semibold tracking-tight tabular-nums",
                    f.tone,
                  )}
                >
                  {f.value}
                </dd>
                <dd className="text-muted-foreground text-[11px]">{f.hint}</dd>
              </div>
            ))}
            <div className="flex min-w-0 flex-col gap-0.5">
              <dt className="text-muted-foreground text-xs font-medium">
                Groups over budget
              </dt>
              <dd
                className={cn(
                  "text-2xl font-semibold tracking-tight tabular-nums",
                  over.length > 0 ? down : up,
                )}
              >
                {over.length}
                <span className="text-muted-foreground text-base font-medium">
                  {" "}
                  / {bills.length}
                </span>
              </dd>
              <dd className="text-muted-foreground text-[11px] tabular-nums">
                {unassigned > 0
                  ? `+ ${kr(unassigned)} unassigned spend`
                  : `${bills.length - over.length} on or under`}
              </dd>
            </div>
          </dl>

          <div className="flex flex-col gap-2">
            <span className="text-muted-foreground text-[11px] font-semibold tracking-widest uppercase">
              Biggest overruns
            </span>
            {overruns.length === 0 ? (
              <p className="text-sm">Every group is on or under budget.</p>
            ) : (
              <ol className="flex flex-col divide-y border-y">
                {overruns.map((r) => (
                  <li
                    key={r.band.key}
                    className="flex items-baseline justify-between gap-3 py-1.5"
                  >
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-sm font-medium">
                        {r.band.name}
                      </span>
                      <span className="text-muted-foreground text-[11px]">
                        over in {r.monthsOver} of {settledCount} months
                      </span>
                    </span>
                    <span className="flex flex-col items-end">
                      <span
                        className={cn("text-sm font-semibold tabular-nums", down)}
                      >
                        {signedKr(r.diff)}
                      </span>
                      {r.budget > 0 && (
                        <span className="text-muted-foreground text-[11px] tabular-nums">
                          {pct(-r.diff / r.budget, -r.diff < r.budget / 10 ? 1 : 0)}{" "}
                          over
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      )}
    </Panel>
  )
}
