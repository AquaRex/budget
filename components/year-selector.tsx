"use client"

import { cn } from "@/lib/utils"
import { setYear, useYear } from "@/lib/year"
import { useBudgetYears } from "@/lib/data/use-budget"

/** Nav year switcher — display + select only. Manage years in Settings. */
export function YearSelector() {
  const year = useYear()
  const { years } = useBudgetYears()

  return (
    <div className="flex items-center gap-0.5">
      {years.map((y) => (
        <button
          key={y}
          type="button"
          onClick={() => setYear(y)}
          className={cn(
            "rounded-md px-2.5 py-1 text-sm font-medium tabular-nums transition-colors",
            y === year
              ? "bg-secondary text-secondary-foreground"
              : "text-muted-foreground hover:text-foreground hover:bg-secondary/60",
          )}
        >
          {y}
        </button>
      ))}
    </div>
  )
}
