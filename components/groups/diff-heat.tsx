import type { MonthStatus } from "@/lib/stats/types"
import { cn } from "@/lib/utils"

const LEVELS = [0.05, 0.15, 0.35, 0.7] // gap / budget thresholds for steps 1..4

/**
 * 0 = on budget, 1..4 = gap relative to the month's budget. A month without a
 * budget is measured against the group's average month, else counts as maximal.
 */
export function diffLevel(
  diff: number,
  budget: number,
  avgBudget: number,
): number {
  const reference = Math.abs(budget) || Math.abs(avgBudget)
  if (diff === 0) {
    return 0
  }
  if (reference === 0) {
    return 4
  }
  const ratio = Math.abs(diff) / reference
  const i = LEVELS.findIndex((t) => ratio < t)
  return i === -1 ? 4 : i
}

export function diffFill(level: number, diff: number): string | undefined {
  if (level === 0) {
    return undefined
  }
  return `var(--diff-${diff > 0 ? "good" : "bad"}-${level})`
}

/** Only fully imported months are judged; others would read as fake savings. */
export function isSettled(status: MonthStatus | undefined): boolean {
  return status === "complete"
}

export function DiffLegend({ className }: { className?: string }) {
  const steps = [4, 3, 2, 1]
  return (
    <div
      className={cn(
        "text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]",
        className,
      )}
    >
      <span className="flex items-center gap-1.5">
        Over budget
        <span className="flex">
          {steps.map((l) => (
            <span
              key={`bad-${l}`}
              className="size-3"
              style={{ backgroundColor: `var(--diff-bad-${l})` }}
            />
          ))}
          <span className="bg-muted size-3" />
          {[...steps].reverse().map((l) => (
            <span
              key={`good-${l}`}
              className="size-3"
              style={{ backgroundColor: `var(--diff-good-${l})` }}
            />
          ))}
        </span>
        Under budget
      </span>
      <span>Savings &amp; income: more than planned is green</span>
      <span>Unfilled = month in progress or not imported yet</span>
    </div>
  )
}
