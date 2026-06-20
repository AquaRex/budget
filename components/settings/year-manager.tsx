"use client"

import { useState } from "react"
import { Plus, X } from "lucide-react"
import { useSWRConfig } from "swr"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { errMessage } from "@/lib/errors"
import { setYear, useYear } from "@/lib/year"
import { useAvailableYears, useBudgetYears } from "@/lib/data/use-budget"
import { copyYearBudget, deleteYearBudget } from "@/lib/data/years"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export function YearManager() {
  const year = useYear()
  const years = useAvailableYears()
  const { years: budgetYears, mutate: mutateYears } = useBudgetYears()
  const { mutate } = useSWRConfig()
  const [dragYear, setDragYear] = useState<number | null>(null)
  const [overYear, setOverYear] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)

  const [adding, setAdding] = useState(false)
  const [newYear, setNewYear] = useState("")
  const [source, setSource] = useState<number | null>(null)

  // Refresh in the background — never let a revalidation error mask a success.
  const refreshAll = () => {
    void mutate(() => true)
    void mutateYears()
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
    } catch (e) {
      console.error("copyYearBudget failed", e)
      toast.error(errMessage(e, "Copy failed."))
      setBusy(false)
      return
    }
    refreshAll()
    toast.success(`Copied ${from} → ${to}.`)
    setBusy(false)
  }

  function openAdd() {
    const latest = years[0] ?? new Date().getFullYear()
    setNewYear(String(latest + 1))
    setSource(budgetYears[0] ?? latest)
    setAdding(true)
  }

  async function add() {
    const y = Number(newYear)
    if (!Number.isInteger(y) || y < 2000 || y > 2100) {
      toast.error("Enter a year between 2000 and 2100.")
      return
    }
    if (years.includes(y) && budgetYears.includes(y)) {
      toast.error(`${y} already has a budget. Drag onto it to overwrite.`)
      return
    }
    setBusy(true)
    try {
      if (source != null) await copyYearBudget(source, y)
    } catch (e) {
      console.error("add year failed", e)
      toast.error(errMessage(e, "Could not add year."))
      setBusy(false)
      return
    }
    refreshAll()
    setYear(y)
    setAdding(false)
    toast.success(source != null ? `Added ${y}, copied from ${source}.` : `Added ${y}.`)
    setBusy(false)
  }

  async function remove(y: number) {
    if (
      !window.confirm(
        `Delete ${y}'s budget?\n\nThis removes ${y}'s bills, income, per-month amounts and salary. Imported transactions are NOT affected.`,
      )
    )
      return
    setBusy(true)
    try {
      await deleteYearBudget(y)
    } catch (e) {
      console.error("deleteYearBudget failed", e)
      toast.error(errMessage(e, "Could not delete year."))
      setBusy(false)
      return
    }
    refreshAll()
    if (year === y) setYear(years.find((x) => x !== y) ?? new Date().getFullYear())
    toast.success(`Deleted ${y}.`)
    setBusy(false)
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-muted-foreground text-sm font-medium">
          Years
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {years.map((y) => {
            const hasBudget = budgetYears.includes(y)
            return (
              <div
                key={y}
                draggable={!busy && hasBudget}
                onDragStart={() => hasBudget && setDragYear(y)}
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
                  y === year ? "border-primary bg-secondary" : "hover:bg-secondary/60",
                  overYear === y && "ring-primary ring-2",
                  dragYear === y && "opacity-40",
                )}
                title={
                  hasBudget
                    ? "Drag onto another year to copy this budget into it (replaces it)"
                    : "Transactions only — no budget yet. Use Add year to build one."
                }
              >
                <button
                  type="button"
                  onClick={() => setYear(y)}
                  disabled={busy}
                  className={cn("cursor-pointer", !hasBudget && "text-muted-foreground")}
                >
                  {y}
                  {!hasBudget && <span className="ml-1 text-[10px]">(actuals)</span>}
                </button>
                {hasBudget && (
                  <button
                    type="button"
                    onClick={() => remove(y)}
                    disabled={busy}
                    aria-label={`Delete ${y} budget`}
                    className="text-muted-foreground hover:text-foreground hover:bg-muted rounded-sm p-0.5"
                  >
                    <X className="size-3.5" />
                  </button>
                )}
              </div>
            )
          })}
          {!adding && (
            <Button variant="outline" size="sm" onClick={openAdd} disabled={busy} className="gap-1">
              <Plus className="size-4" />
              Add year
            </Button>
          )}
        </div>

        {adding && (
          <div className="flex flex-wrap items-end gap-2 rounded-md border p-3">
            <label className="flex flex-col gap-1 text-xs">
              <span className="text-muted-foreground">Year</span>
              <Input
                inputMode="numeric"
                value={newYear}
                onChange={(e) => setNewYear(e.target.value)}
                className="w-24"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs">
              <span className="text-muted-foreground">Copy budget from</span>
              <Select
                value={source != null ? String(source) : ""}
                onValueChange={(v) => setSource(Number(v))}
              >
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  {budgetYears.map((y) => (
                    <SelectItem key={y} value={String(y)}>
                      {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <Button size="sm" onClick={add} disabled={busy}>
              Create
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setAdding(false)} disabled={busy}>
              Cancel
            </Button>
          </div>
        )}

        <p className="text-muted-foreground text-xs">
          Click a year to switch · drag one budget year onto another to copy
          (replaces the target) · × deletes a year&apos;s budget. Years marked
          “(actuals)” only have imported transactions.
        </p>
      </CardContent>
    </Card>
  )
}
