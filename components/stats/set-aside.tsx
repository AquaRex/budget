"use client"

import { Check } from "lucide-react"

import type { CategorySlice } from "@/lib/stats/types"
import { cn } from "@/lib/utils"
import { down, kr, signedKr, up } from "@/components/stats/display"

/**
 * Savings / investment groups: money set aside, not spent. Each row compares
 * what went in with what was budgeted to go in.
 */
export function SetAside({
  savings,
  inProgress,
}: {
  savings: CategorySlice[]
  inProgress: boolean // current month: a shortfall is "to go", not "short"
}) {
  const rows = savings.filter((s) => s.amount !== 0 || s.budget > 0)
  if (rows.length === 0) {
    return null
  }
  const max = Math.max(...rows.map((s) => Math.max(s.amount, s.budget)), 1)

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <h3 className="text-muted-foreground text-[11px] font-semibold tracking-widest uppercase">
        Set aside
      </h3>
      <ul className="flex min-w-0 flex-col gap-3">
        {rows.map((s) => {
          const gap = s.budget - s.amount
          let status: { text: string; className?: string; done?: boolean }
          if (s.amount < 0) {
            status = { text: `withdrew ${kr(-s.amount)}`, className: down }
          } else if (s.budget <= 0) {
            status = { text: "no budget" }
          } else if (gap <= 0) {
            status = {
              text: gap < 0 ? `${kr(-gap)} extra` : "on target",
              className: up,
              done: true,
            }
          } else if (inProgress) {
            status = { text: `${kr(gap)} to go` }
          } else {
            status = { text: `short by ${kr(gap)}`, className: down }
          }
          return (
            <li key={s.id ?? "none"} className="flex min-w-0 flex-col gap-1">
              <div className="flex min-w-0 items-baseline justify-between gap-3 text-sm">
                <span className="truncate font-medium">{s.name}</span>
                <span className="shrink-0 font-semibold tabular-nums">
                  {s.amount < 0 ? signedKr(s.amount) : kr(s.amount)}
                  {s.budget > 0 && (
                    <span className="text-muted-foreground font-normal">
                      {" "}
                      of {kr(s.budget)}
                    </span>
                  )}
                </span>
              </div>
              <div className="bg-muted relative h-2">
                <div
                  className="absolute inset-y-0 left-0 bg-(--viz-income) transition-[width] duration-700 ease-out motion-reduce:transition-none"
                  style={{ width: `${(Math.max(0, s.amount) / max) * 100}%` }}
                />
                {s.budget > 0 && (
                  <div
                    className="bg-primary absolute -inset-y-1 w-1"
                    style={{ left: `calc(${(s.budget / max) * 100}% - 2px)` }}
                  />
                )}
              </div>
              <span
                className={cn(
                  "text-muted-foreground flex items-center gap-1 text-[11px] tabular-nums",
                  status.className,
                )}
              >
                {status.done && <Check className="size-3" aria-hidden />}
                {status.text}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
