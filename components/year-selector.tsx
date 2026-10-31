"use client"

import { ChevronLeft, ChevronRight } from "lucide-react"

import { cn } from "@/lib/utils"
import { setYear, useYear } from "@/lib/year"
import { useAvailableYears } from "@/lib/data/use-budget"

/**
 * Nav year switcher: arrows step to any year (nothing is created until you
 * enter something there); chips are the years that have data, plus the
 * selected one. Manage years in Settings.
 */
export function YearSelector() {
  const year = useYear()
  const withData = useAvailableYears()
  const years = withData.includes(year) ? withData : [...withData, year].sort((a, b) => a - b)

  return (
    <div className="flex items-center gap-0.5">
      <button
        type="button"
        aria-label="Previous year"
        onClick={() => setYear(year - 1)}
        className="text-muted-foreground hover:text-foreground hover:bg-secondary/60 flex size-8 items-center justify-center rounded-md"
      >
        <ChevronLeft className="size-4" />
      </button>
      {years.map((y) => (
        <button
          key={y}
          type="button"
          onClick={() => setYear(y)}
          title={withData.includes(y) ? undefined : "No data in this year yet"}
          className={cn(
            "rounded-md px-2.5 py-1 text-sm font-medium tabular-nums transition-colors",
            y === year
              ? "bg-secondary text-secondary-foreground"
              : "text-muted-foreground hover:text-foreground hover:bg-secondary/60",
            !withData.includes(y) && "border-muted-foreground/40 border border-dashed",
          )}
        >
          {y}
        </button>
      ))}
      <button
        type="button"
        aria-label="Next year"
        onClick={() => setYear(year + 1)}
        className="text-muted-foreground hover:text-foreground hover:bg-secondary/60 flex size-8 items-center justify-center rounded-md"
      >
        <ChevronRight className="size-4" />
      </button>
    </div>
  )
}
