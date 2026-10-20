"use client"

import { useMemo, useSyncExternalStore } from "react"

import { buildTypeMap } from "@/lib/spending"
import {
  useAmounts,
  useBudgetContext,
  useCategories,
  useEntries,
  useImports,
  useLabels,
  useSalaryProfile,
  useTransactions,
  useTypeCategories,
} from "@/lib/data/use-budget"
import { computeDashboardStats } from "@/lib/stats/compute"
import type { DashboardStats, DashboardStatsInput } from "@/lib/stats/types"
import { isoDate } from "@/lib/stats/dates"

const todayKey = () => isoDate(new Date())

// Re-checks the date when the app is resumed (an /os PWA can sleep past
// midnight) and every minute while it's open; only a new date re-renders.
function subscribeToDate(onChange: () => void): () => void {
  const timer = setInterval(onChange, 60_000)
  document.addEventListener("visibilitychange", onChange)
  window.addEventListener("focus", onChange)
  return () => {
    clearInterval(timer)
    document.removeEventListener("visibilitychange", onChange)
    window.removeEventListener("focus", onChange)
  }
}

/** Budget entries/amounts follow the globally selected year, so pass `useYear()` as input.year. */
export function useDashboardStats(input: DashboardStatsInput): DashboardStats {
  const { entries: bills, isLoading: billsLoading } = useEntries("bill")
  const { entries: incomes, isLoading: incomesLoading } = useEntries("income")
  const { amounts, isLoading: amountsLoading } = useAmounts()
  const { profile, isLoading: salaryLoading } = useSalaryProfile()
  const ctx = useBudgetContext(amounts, profile)
  const { categories, isLoading: categoriesLoading } = useCategories()
  const { labels, isLoading: labelsLoading } = useLabels()
  const { transactions, isLoading: transactionsLoading } = useTransactions()
  const { typeCategories, isLoading: typesLoading } = useTypeCategories()
  const { imports, isLoading: importsLoading } = useImports()
  const today = useSyncExternalStore(subscribeToDate, todayKey, todayKey)

  const typeMap = useMemo(() => buildTypeMap(typeCategories), [typeCategories])
  const { year, month, scope, includeIncomplete } = input
  const stats = useMemo(
    () =>
      computeDashboardStats(
        { transactions, categories, labels, typeMap, imports, bills, incomes, ctx },
        { year, month, scope, includeIncomplete },
        new Date(`${today}T00:00`),
      ),
    [transactions, categories, labels, typeMap, imports, bills, incomes, ctx, year, month, scope, includeIncomplete, today],
  )

  const loading =
    billsLoading ||
    incomesLoading ||
    amountsLoading ||
    salaryLoading ||
    categoriesLoading ||
    labelsLoading ||
    transactionsLoading ||
    typesLoading ||
    importsLoading
  return { ...stats, loading }
}
