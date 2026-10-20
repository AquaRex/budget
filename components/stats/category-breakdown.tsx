"use client"

import type { CategorySlice } from "@/lib/stats/types"
import { cn } from "@/lib/utils"
import {
  down,
  kr,
  pct,
  signedKr,
  signedPct,
  up,
  type CategoryPalette,
} from "@/components/stats/display"

/**
 * Where the money goes: one row per category, bar = amount. Ticks mark the
 * category's usual month (month scope) and its budget, so over/under reads at
 * a glance.
 */
export function CategoryBreakdown({
  categories,
  palette,
  compareBaseline,
  limit = 8,
}: {
  categories: CategorySlice[]
  palette: CategoryPalette
  compareBaseline: boolean
  limit?: number
}) {
  // Baseline-only rows (nothing spent, nothing budgeted) are noise here;
  // budgeted-but-unspent and refund-net rows stay so the list sums to spent.
  const spent = categories.filter((c) => c.amount !== 0 || c.budget > 0)
  if (spent.length === 0) {
    return (
      <p className="text-muted-foreground py-8 text-center text-sm">
        No spending in this period.
      </p>
    )
  }
  // Refund-net rows are always listed so the budget and sum stay visible.
  const outflow = spent.filter((c) => c.amount >= 0)
  const refunds = spent.filter((c) => c.amount < 0)
  const shown = [...outflow.slice(0, limit), ...refunds]
  const rest = outflow.slice(limit)
  const restAmount = rest.reduce((s, c) => s + c.amount, 0)
  const anyBudget = shown.some((c) => c.budget > 0)
  const max = Math.max(
    ...shown.map((c) =>
      Math.max(c.amount, c.budget, compareBaseline ? c.baseline : 0),
    ),
    1,
  )
  const at = (v: number) => `calc(${(v / max) * 100}% - 1px)`

  return (
    <ul className="flex min-w-0 flex-col gap-3">
      {shown.map((c) => {
        const delta =
          c.baseline > 0 && c.amount > 0
            ? (c.amount - c.baseline) / c.baseline
            : null
        const over = c.budget > 0 ? c.amount - c.budget : 0
        return (
          <li key={c.id ?? "none"} className="flex min-w-0 flex-col gap-1">
            <div className="flex min-w-0 items-baseline justify-between gap-3 text-sm">
              <span className="flex min-w-0 items-center gap-2">
                <span
                  className="size-2.5 shrink-0"
                  style={{ background: palette.color(c.id) }}
                />
                <span className="truncate font-medium">{c.name}</span>
                <span className="text-muted-foreground text-xs tabular-nums">
                  {pct(c.share)}
                </span>
              </span>
              <span className="flex shrink-0 items-baseline gap-2">
                {compareBaseline &&
                  delta != null &&
                  Math.abs(delta) >= 0.05 && (
                    <span
                      className={cn(
                        "text-[11px] font-medium tabular-nums",
                        delta > 0 ? down : up,
                      )}
                    >
                      {signedPct(delta)}
                    </span>
                  )}
                <span
                  className={cn(
                    "font-semibold tabular-nums",
                    c.amount < 0 && up,
                  )}
                >
                  {c.amount < 0
                    ? `${signedKr(c.amount)} · net refund`
                    : kr(c.amount)}
                </span>
              </span>
            </div>
            <div
              className="relative h-2"
              title={`${c.name}: ${kr(c.amount)} · usual ${kr(c.baseline)}/mo${c.budget > 0 ? ` · budget ${kr(c.budget)}` : ""}`}
            >
              <div className="bg-muted absolute inset-0" />
              <div
                className="absolute inset-y-0 left-0 transition-[width] duration-700 ease-out motion-reduce:transition-none"
                style={{
                  width: `${(Math.max(0, c.amount) / max) * 100}%`,
                  background: palette.color(c.id),
                }}
              />
              {compareBaseline && c.baseline > 0 && (
                <div
                  className="bg-foreground absolute -inset-y-0.5 w-0.5"
                  style={{ left: at(c.baseline) }}
                />
              )}
              {c.budget > 0 && (
                <div
                  className="bg-primary absolute -inset-y-1 w-1"
                  style={{ left: at(c.budget) }}
                />
              )}
            </div>
            {(c.budget > 0 || !compareBaseline) && (
              <span className="text-muted-foreground truncate text-[11px] tabular-nums">
                {!compareBaseline && `${kr(c.baseline)} / month · `}
                {c.budget > 0 && (
                  <>
                    {c.amount > 0
                      ? `budget ${kr(c.budget)}`
                      : `nothing spent of ${kr(c.budget)} budget`}
                    {over > 0 && (
                      <span className={down}> · {kr(over)} over</span>
                    )}
                    {!compareBaseline && " · "}
                  </>
                )}
                {!compareBaseline && `${c.txCount} transactions`}
              </span>
            )}
          </li>
        )
      })}
      {rest.length > 0 && (
        <li className="text-muted-foreground flex justify-between text-xs">
          <span>
            + {rest.length} more
            {restAmount === 0 ? " (budgeted, nothing spent)" : ""}
          </span>
          {restAmount !== 0 && (
            <span className="tabular-nums">
              {restAmount < 0 ? signedKr(restAmount) : kr(restAmount)}
            </span>
          )}
        </li>
      )}
      {refunds.length > 0 && (
        <li className="text-muted-foreground text-[11px]">
          Shares of net spending (after refunds)
        </li>
      )}
      {(compareBaseline || anyBudget) && (
        <li className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]">
          {compareBaseline && (
            <span className="flex items-center gap-1.5">
              <span className="bg-foreground h-3 w-0.5" /> usual month
            </span>
          )}
          {anyBudget && (
            <span className="flex items-center gap-1.5">
              <span className="bg-primary h-3 w-1" /> budget
            </span>
          )}
        </li>
      )}
    </ul>
  )
}
