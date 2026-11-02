"use client"

import type { GoalProjection } from "@/lib/goals/compute"
import { cn } from "@/lib/utils"
import { kr } from "@/components/stats/display"

const MAX_GROUPS = 8
const MAX_CULPRITS = 5

type Impact = { key: string; label: string; detail: string; value: number }

const perMonth = (n: number) => `${kr(Math.round(Math.abs(n)))}/mo`
const signed = (n: number) =>
  `${Math.round(n) > 0 ? "+" : Math.round(n) < 0 ? "−" : ""}${perMonth(n)}`

/**
 * Where the monthly saving the goal needs is won and lost: the budget against
 * what's needed, then income and every spending group against the budget.
 * + helps reach the goal, − pushes it away.
 */
export function GoalBreakdown({ p }: { p: GoalProjection }) {
  const need = p.needPerMonth ?? 0
  const groups = p.groupDiffs.map((g) => ({
    key: `g-${g.id ?? "none"}`,
    label: g.name,
    detail: `spent ${perMonth(g.actual)} · budget ${perMonth(g.budget)}`,
    value: -g.perMonth,
  }))
  const ranked = [...groups].sort(
    (a, b) => Math.abs(b.value) - Math.abs(a.value),
  )
  const shown = ranked.slice(0, MAX_GROUPS).sort((a, b) => a.value - b.value)
  const rest = ranked.slice(MAX_GROUPS)
  const rows: Impact[] = [
    {
      key: "budget",
      label: "Budget vs what the goal needs",
      detail: `budget saves ${perMonth(p.budgetPerMonth)} · goal needs ${perMonth(need)}`,
      value: p.budgetPerMonth - need,
    },
    ...(p.diffMonths
      ? [
          {
            key: "income",
            label: "Income vs budget",
            detail:
              p.incomeDiffPerMonth < 0 ? "below budget" : "at or above budget",
            value: p.incomeDiffPerMonth,
          },
          ...shown,
        ]
      : []),
    ...(rest.length
      ? [
          {
            key: "rest",
            label: `${rest.length} other group${rest.length === 1 ? "" : "s"}`,
            detail: "combined",
            value: rest.reduce((s, r) => s + r.value, 0),
          },
        ]
      : []),
  ]
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.value)))

  return (
    <section className="flex flex-col gap-6">
      {p.verdict !== "on-track" && <Culprits p={p} need={need} />}

      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-semibold">Where the gap comes from</h3>
        <span className="text-muted-foreground text-[11px]">
          ← hurts · helps →
        </span>
      </div>

      <ul className="flex flex-col">
        {rows.map((r) => {
          const width = `${(Math.abs(r.value) / max) * 50}%`
          const hurts = r.value < -0.5
          const helps = r.value > 0.5
          return (
            <li
              key={r.key}
              className={cn(
                "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 py-1.5 sm:grid-cols-[minmax(0,15rem)_minmax(0,1fr)_7rem]",
                r.key === "budget" && "mb-1 border-b pb-2.5",
              )}
              title={`${r.label}: ${signed(r.value)} (${r.detail})`}
            >
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-sm">{r.label}</span>
                <span className="text-muted-foreground text-[11px]">
                  {r.detail}
                </span>
              </span>
              <span className="relative col-span-2 h-4 sm:order-2 sm:col-span-1">
                <span className="bg-border absolute inset-y-[-4px] left-1/2 w-px" />
                {(hurts || helps) && (
                  <span
                    className={cn(
                      "absolute inset-y-0",
                      hurts
                        ? "right-1/2 rounded-l-sm bg-rose-500/80 dark:bg-rose-400/80"
                        : "left-1/2 rounded-r-sm bg-emerald-500/80 dark:bg-emerald-400/80",
                    )}
                    style={{ width }}
                  />
                )}
              </span>
              <span
                className={cn(
                  "order-first col-start-2 row-start-1 text-right text-sm font-medium tabular-nums sm:order-3 sm:col-start-3",
                  hurts && "text-rose-700 dark:text-rose-400",
                  helps && "text-emerald-700 dark:text-emerald-400",
                )}
              >
                {signed(r.value)}
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

const CULPRIT_COLORS = [1, 2, 4, 5, 7].map((n) => `var(--viz-cat-${n})`)

/** One bar of everything costing the goal money each month, biggest first. */
function Culprits({ p, need }: { p: GoalProjection; need: number }) {
  const ranked = [
    {
      key: "budget",
      label: "Budget too small",
      value: Math.max(0, need - p.budgetPerMonth),
    },
    {
      key: "income",
      label: "Income below budget",
      value: p.incomeShortPerMonth,
    },
    ...p.groupDiffs
      .filter((g) => g.perMonth > 0)
      .map((g) => ({
        key: `g-${g.id ?? "none"}`,
        label: `${g.name} over budget`,
        value: g.perMonth,
      })),
  ]
    .filter((c) => c.value >= 1)
    .sort((a, b) => b.value - a.value)
  const rest = ranked.slice(MAX_CULPRITS)
  const culprits = [
    ...ranked
      .slice(0, MAX_CULPRITS)
      .map((c, i) => ({ ...c, color: CULPRIT_COLORS[i] })),
    ...(rest.length
      ? [
          {
            key: "rest",
            label: `${rest.length} more`,
            value: rest.reduce((s, c) => s + c.value, 0),
            color: "var(--viz-other)",
          },
        ]
      : []),
  ]
  if (!culprits.length) {
    return null
  }
  const total = culprits.reduce((s, c) => s + c.value, 0)
  const pct = (v: number) => Math.round((v / total) * 100)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-semibold">What&apos;s holding you back</h3>
        <span className="text-sm font-semibold text-rose-700 tabular-nums dark:text-rose-400">
          −{perMonth(total)}
        </span>
      </div>
      <div className="flex h-9 w-full gap-0.5 overflow-hidden rounded-sm">
        {culprits.map((c) => (
          <div
            key={c.key}
            className="flex min-w-0 items-center justify-center text-xs font-semibold text-white"
            style={{ flexGrow: c.value, flexBasis: 0, background: c.color }}
            title={`${c.label}: ${perMonth(c.value)} (${pct(c.value)}%)`}
          >
            {pct(c.value) >= 10 && `${pct(c.value)}%`}
          </div>
        ))}
      </div>
      <ul className="grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">
        {culprits.map((c, i) => (
          <li key={c.key} className="flex items-center gap-2 text-sm">
            <span
              className="size-3 shrink-0 rounded-sm"
              style={{ background: c.color }}
            />
            <span
              className={cn("min-w-0 truncate", i === 0 && "font-semibold")}
            >
              {c.label}
            </span>
            <span className="text-muted-foreground ml-auto tabular-nums">
              {perMonth(c.value)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
