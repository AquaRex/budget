import type { ReactNode } from "react"

import type { GroupKind } from "@/lib/stats/groups"
import { cn } from "@/lib/utils"
import { kr } from "@/components/stats/display"

export const SECTIONS: { kind: GroupKind; title: string }[] = [
  { kind: "bill", title: "Spending groups" },
  { kind: "savings", title: "Set aside" },
  { kind: "income", title: "Income" },
]

/** How the difference reads for each kind; + is always good. */
export function verdict(
  kind: GroupKind,
  diff: number,
  inProgress: boolean,
): string {
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

/** Actual against budget; spending reads neutral within budget, only the overspend is rose. */
export function BudgetBar({
  kind,
  actual,
  budget,
}: {
  kind: GroupKind
  actual: number
  budget: number
}) {
  const max = Math.max(actual, budget, 1)
  const within =
    kind === "bill" && budget > 0
      ? Math.min(Math.max(0, actual), budget)
      : Math.max(0, actual)
  const over = kind === "bill" && budget > 0 ? Math.max(0, actual - budget) : 0
  const bar = kind === "bill" ? "bg-foreground/35" : "bg-(--viz-income)"

  return (
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
  )
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="text-muted-foreground px-1 text-[11px] font-semibold tracking-widest uppercase">
      {children}
    </h2>
  )
}
