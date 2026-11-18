"use client"

import { useState } from "react"
import { useSWRConfig } from "swr"
import { toast } from "sonner"
import { Copy, Trash2 } from "lucide-react"

import { errMessage } from "@/lib/errors"
import { useYear } from "@/lib/year"
import { useBudgetYears } from "@/lib/data/use-budget"
import { copyYearBudget, deleteYearBudget } from "@/lib/data/years"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

/**
 * The selected year's budget as a whole: copy it from ANY other year that has a
 * budget (replacing this year's), or delete it. Budget only — imported
 * transactions are never touched by either action.
 */
export function YearBudgetBar() {
  const year = useYear()
  const { stored, isLoading, mutate: mutateYears } = useBudgetYears()
  const { mutate } = useSWRConfig()
  const [busy, setBusy] = useState(false)
  const [picked, setPicked] = useState<number | null>(null)

  if (isLoading) return null
  const hasBudget = stored.includes(year)
  const sources = stored.filter((y) => y !== year) // newest first
  // Default source: the closest earlier year, else the closest later one.
  const fallback =
    sources.find((y) => y < year) ?? [...sources].reverse().find((y) => y > year) ?? null
  const source = picked != null && sources.includes(picked) ? picked : fallback

  const refresh = () => {
    void mutate(() => true)
    void mutateYears()
  }

  async function copy() {
    if (source == null) return
    if (
      hasBudget &&
      !window.confirm(
        `Replace ${year}'s budget with a copy of ${source}?\n\nThis overwrites ${year}'s bills, income, per-month amounts and salary. Transactions are not affected.`,
      )
    )
      return
    setBusy(true)
    try {
      await copyYearBudget(source, year)
      refresh()
      toast.success(`Copied ${source}'s budget into ${year}.`)
    } catch (e) {
      toast.error(errMessage(e, "Copy failed."))
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (
      !window.confirm(
        `Delete ${year}'s budget?\n\nThis removes ${year}'s bills, income, per-month amounts and salary. Imported transactions are NOT affected.`,
      )
    )
      return
    setBusy(true)
    try {
      await deleteYearBudget(year)
      refresh()
      toast.success(`Deleted ${year}'s budget.`)
    } catch (e) {
      toast.error(errMessage(e, "Could not delete the budget."))
    } finally {
      setBusy(false)
    }
  }

  const picker = sources.length > 0 && (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-muted-foreground text-sm">Copy from</span>
      <Select value={source != null ? String(source) : undefined} onValueChange={(v) => setPicked(Number(v))}>
        <SelectTrigger size="sm" className="w-24" aria-label="Year to copy the budget from">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {sources.map((y) => (
            <SelectItem key={y} value={String(y)}>
              {y}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button size="sm" variant={hasBudget ? "outline" : "default"} onClick={copy} disabled={busy || source == null} className="gap-1.5">
        <Copy className="size-3.5" />
        Copy into {year}
      </Button>
    </div>
  )

  if (!hasBudget) {
    return (
      <div className="bg-muted/50 flex flex-wrap items-center justify-between gap-3 border border-dashed px-4 py-3">
        <p className="text-sm">
          <span className="font-medium">{year} has no budget yet.</span>{" "}
          <span className="text-muted-foreground">
            {sources.length > 0
              ? "Start from another year's bills, income and salary, or add rows from scratch below."
              : "Add rows below to build it."}
          </span>
        </p>
        {picker}
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-3">
      {picker}
      <Button size="sm" variant="ghost" onClick={remove} disabled={busy} className="text-muted-foreground hover:text-destructive gap-1.5">
        <Trash2 className="size-3.5" />
        Delete {year} budget
      </Button>
    </div>
  )
}
