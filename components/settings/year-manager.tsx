"use client"

import { useState } from "react"
import { Plus, X } from "lucide-react"
import { useSWRConfig } from "swr"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { errMessage } from "@/lib/errors"
import { setYear, useYear } from "@/lib/year"
import { useBudgetYears } from "@/lib/data/use-budget"
import { copyYearBudget, deleteYearBudget } from "@/lib/data/years"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export function YearManager() {
  const year = useYear()
  const { years, mutate: mutateYears } = useBudgetYears()
  const { mutate } = useSWRConfig()
  const [dragYear, setDragYear] = useState<number | null>(null)
  const [overYear, setOverYear] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)

  const refreshAll = async () => {
    await mutate(() => true)
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
      toast.error(errMessage(e, "Copy failed."))
    } finally {
      setBusy(false)
    }
  }

  async function add() {
    const source = years[0] ?? new Date().getFullYear()
    const next = source + 1
    setBusy(true)
    try {
      await copyYearBudget(source, next)
      await refreshAll()
      setYear(next)
      toast.success(`Added ${next}, copied from ${source}.`)
    } catch (e) {
      toast.error(errMessage(e, "Could not add year."))
    } finally {
      setBusy(false)
    }
  }

  async function remove(y: number) {
    if (
      !window.confirm(
        `Delete ${y}'s budget entirely?\n\nThis removes ${y}'s bills, income, per-month amounts and salary. Imported transactions are not affected.`,
      )
    )
      return
    setBusy(true)
    try {
      await deleteYearBudget(y)
      await refreshAll()
      if (year === y) setYear(years.find((x) => x !== y) ?? new Date().getFullYear())
      toast.success(`Deleted ${y}.`)
    } catch (e) {
      toast.error(errMessage(e, "Could not delete year."))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-muted-foreground text-sm font-medium">
          Years
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {years.map((y) => (
            <div
              key={y}
              draggable={!busy}
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
                "flex items-center gap-1 rounded-md border py-1 pr-1 pl-2.5 text-sm font-medium tabular-nums transition-colors",
                y === year
                  ? "border-primary bg-secondary"
                  : "hover:bg-secondary/60",
                overYear === y && "ring-primary ring-2",
                dragYear === y && "opacity-40",
                !busy && "cursor-grab active:cursor-grabbing",
              )}
              title="Drag onto another year to copy this budget into it (replaces it)"
            >
              <button
                type="button"
                onClick={() => setYear(y)}
                disabled={busy}
                className="cursor-pointer"
              >
                {y}
              </button>
              <button
                type="button"
                onClick={() => remove(y)}
                disabled={busy}
                aria-label={`Delete ${y}`}
                className="text-muted-foreground hover:text-foreground hover:bg-muted rounded-sm p-0.5"
              >
                <X className="size-3.5" />
              </button>
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            onClick={add}
            disabled={busy}
            className="gap-1"
          >
            <Plus className="size-4" />
            Add {(years[0] ?? new Date().getFullYear()) + 1}
          </Button>
        </div>
        <p className="text-muted-foreground text-xs">
          Click a year to switch · drag one onto another to copy its budget
          (replaces the target) · × deletes a year.
        </p>
      </CardContent>
    </Card>
  )
}
