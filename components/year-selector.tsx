"use client"

import { useState } from "react"
import { Plus } from "lucide-react"
import { useSWRConfig } from "swr"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { setYear, useYear } from "@/lib/year"
import { useBudgetYears } from "@/lib/data/use-budget"
import { copyYearBudget } from "@/lib/data/years"
import { Button } from "@/components/ui/button"

export function YearSelector() {
  const year = useYear()
  const { years, mutate: mutateYears } = useBudgetYears()
  const { mutate } = useSWRConfig()
  const [dragYear, setDragYear] = useState<number | null>(null)
  const [overYear, setOverYear] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)

  const refreshAll = async () => {
    await mutate(() => true) // revalidate every SWR key
    await mutateYears()
  }

  async function copy(from: number, to: number) {
    if (from === to) return
    if (
      !window.confirm(
        `Replace ${to}'s budget with a copy of ${from}?\n\nThis overwrites ${to}'s bills, income, per-month amounts and salary.`,
      )
    )
      return
    setBusy(true)
    try {
      await copyYearBudget(from, to)
      await refreshAll()
      toast.success(`Copied ${from} → ${to}.`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Copy failed.")
    } finally {
      setBusy(false)
    }
  }

  async function addYear() {
    const source = years[0] ?? new Date().getFullYear()
    const next = source + 1
    setBusy(true)
    try {
      await copyYearBudget(source, next)
      await refreshAll()
      setYear(next)
      toast.success(`Added ${next}, copied from ${source}.`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not add year.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex items-center gap-0.5">
      {years.map((y) => (
        <button
          key={y}
          type="button"
          draggable={!busy}
          onClick={() => setYear(y)}
          onDragStart={() => setDragYear(y)}
          onDragEnd={() => {
            setDragYear(null)
            setOverYear(null)
          }}
          onDragOver={(e) => {
            if (dragYear != null && dragYear !== y) {
              e.preventDefault()
              setOverYear(y)
            }
          }}
          onDragLeave={() => setOverYear((o) => (o === y ? null : o))}
          onDrop={(e) => {
            e.preventDefault()
            const from = dragYear
            setOverYear(null)
            if (from != null) copy(from, y)
          }}
          className={cn(
            "rounded-md px-2.5 py-1 text-sm font-medium tabular-nums transition-colors",
            y === year
              ? "bg-secondary text-secondary-foreground"
              : "text-muted-foreground hover:text-foreground hover:bg-secondary/60",
            overYear === y && "ring-primary ring-2 ring-offset-0",
            dragYear === y && "opacity-40",
          )}
          title="Click to select · drag onto another year to copy this year's budget into it"
        >
          {y}
        </button>
      ))}
      <Button
        variant="ghost"
        size="icon"
        className="size-7"
        onClick={addYear}
        disabled={busy}
        aria-label="Add next year"
        title={`Add ${(years[0] ?? new Date().getFullYear()) + 1} (copies the latest year)`}
      >
        <Plus className="size-4" />
      </Button>
    </div>
  )
}
