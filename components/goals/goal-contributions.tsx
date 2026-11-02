import Link from "next/link"
import { PiggyBank, Target } from "lucide-react"

import type { Contribution } from "@/lib/goals/compute"
import { cn } from "@/lib/utils"
import { kr } from "@/components/stats/display"

const perMonth = (n: number) => `${kr(Math.round(n))}/mo`

/** Savings groups and Goals categories: the money already set aside each month. */
export function GoalContributions({
  contributions,
}: {
  contributions: Contribution[]
}) {
  if (!contributions.length) {
    return (
      <p className="text-muted-foreground text-xs">
        No savings groups yet. Mark a group as Savings, or a category as “Count
        towards Goals”, in{" "}
        <Link href="/settings" className="text-primary hover:underline">
          Settings
        </Link>{" "}
        to see them here.
      </p>
    )
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-semibold">Going towards it</h3>
        <span className="text-muted-foreground text-[11px]">
          per month this year
        </span>
      </div>
      <ul className="flex flex-wrap gap-2">
        {contributions.map((c) => {
          const Icon = c.kind === "savings" ? PiggyBank : Target
          return (
            <li
              key={`${c.kind}-${c.id}`}
              title={
                c.kind === "savings"
                  ? "Savings group: never counted as spending"
                  : "Counted towards Goals: still spending in its group's budget"
              }
              className="flex items-center gap-2 border px-2.5 py-1.5 text-sm"
            >
              <Icon
                className={cn(
                  "size-4 shrink-0",
                  c.kind === "savings"
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-sky-600 dark:text-sky-400",
                )}
              />
              <span className="min-w-0 truncate">{c.name}</span>
              <span className="font-medium tabular-nums">
                {c.perMonth === null ? "—" : perMonth(c.perMonth)}
              </span>
              {c.budgetPerMonth !== null && c.budgetPerMonth > 0 && (
                <span className="text-muted-foreground text-xs tabular-nums">
                  of {perMonth(c.budgetPerMonth)} budgeted
                </span>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
