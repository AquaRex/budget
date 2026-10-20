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
  const { days, dataFrom, dataThrough, categoryHistory } = stats
  return useMemo(() => {
    const covered = coverage(dataFrom, dataThrough)
    const heatMonths: HeatDay[][] = Array.from({ length: 12 }, () => [])
    for (const d of days) {
      heatMonths[Number(d.date.slice(5, 7)) - 1].push({
        ...d,
        covered: covered(d),
      })
    }
    return {
      heatMonths,
      scale: heatScale(days, covered),
      palette: categoryPalette(categoryHistory),
    }
  }, [days, dataFrom, dataThrough, categoryHistory])
}
