"use client"

import { useMemo } from "react"

import type { DashboardStats } from "@/lib/stats/types"
import type { HeatDay } from "@/components/stats/spending-heatmap"
import {
  categoryPalette,
  coverage,
  heatScale,
} from "@/components/stats/display"

/** Display-only shaping shared by the home dashboard and /os. */
export function useVizData(stats: DashboardStats) {
  const { days, months, dataFrom, dataThrough, categoryHistory } = stats
  return useMemo(() => {
    const covered = coverage(dataFrom, dataThrough)
    const heatMonths: HeatDay[][] = Array.from({ length: 12 }, () => [])
    for (const d of days) {
      const m = Number(d.date.slice(5, 7)) - 1
      // Payday: the day brings at least half the month's budgeted income.
      const budgetIncome = months[m]?.budgetIncome ?? 0
      heatMonths[m].push({
        ...d,
        covered: covered(d),
        payday: budgetIncome > 0 && d.income >= budgetIncome / 2,
      })
    }
    return {
      heatMonths,
      scale: heatScale(days, covered),
      palette: categoryPalette(categoryHistory),
    }
  }, [days, months, dataFrom, dataThrough, categoryHistory])
}
