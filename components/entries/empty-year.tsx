"use client"

import { useState } from "react"
import { useSWRConfig } from "swr"
import { toast } from "sonner"

import { errMessage } from "@/lib/errors"
import { useYear } from "@/lib/year"
import { useBudgetYears } from "@/lib/data/use-budget"
import { copyYearBudget } from "@/lib/data/years"
import { Button } from "@/components/ui/button"

/** A year with no budget yet: offer to start it from the closest earlier one. */
export function EmptyYear() {
  const year = useYear()
  const { years, isLoading, mutate: mutateYears } = useBudgetYears()
  const { mutate } = useSWRConfig()
  const [busy, setBusy] = useState(false)

  if (isLoading || years.includes(year) || years.length === 0) {
    return null
  }
  const earlier = years.filter((y) => y < year)
  const source = earlier.length ? Math.max(...earlier) : Math.min(...years)

  async function copy() {
    setBusy(true)
    try {
      await copyYearBudget(source, year)
      void mutate(() => true)
      void mutateYears()
      toast.success(`Started ${year} from ${source}'s budget.`)
    } catch (e) {
      toast.error(errMessage(e, "Copy failed."))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="bg-muted/50 flex flex-wrap items-center justify-between gap-3 border border-dashed px-4 py-3">
      <p className="text-sm">
        <span className="font-medium">{year} has no budget yet.</span>{" "}
        <span className="text-muted-foreground">
          Start from {source}&apos;s bills, income and salary, or add rows from scratch below.
        </span>
      </p>
      <Button size="sm" onClick={copy} disabled={busy}>
        Copy {source} into {year}
      </Button>
    </div>
  )
}
