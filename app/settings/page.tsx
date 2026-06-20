"use client"

import { useMemo } from "react"

import { buildTypeMap } from "@/lib/spending"
import {
  useEntries,
  useAmounts,
  useSalaryProfile,
  useBudgetContext,
  useCategories,
  useTransactions,
  useTypeCategories,
} from "@/lib/data/use-budget"
import { Skeleton } from "@/components/ui/skeleton"
import { CategoryGroups } from "@/components/settings/category-groups"
import { DateModeToggle } from "@/components/settings/date-mode-toggle"

export default function SettingsPage() {
  const { entries: bills } = useEntries("bill")
  const { entries: incomes } = useEntries("income")
  const { amounts } = useAmounts()
  const { profile } = useSalaryProfile()
  const { categories, isLoading: lc, mutate: mutateCategories } = useCategories()
  const ctx = useBudgetContext(amounts, profile)
  const { transactions } = useTransactions()
  const { typeCategories } = useTypeCategories()
  const typeMap = useMemo(() => buildTypeMap(typeCategories), [typeCategories])

  const groups = useMemo(() => {
    const used = new Set<string>()
    for (const e of [...bills, ...incomes])
      if (e.category_id) used.add(e.category_id)
    return categories
      .filter((c) => used.has(c.id))
      .sort((a, b) => a.sort_order - b.sort_order)
  }, [categories, bills, incomes])

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>

      <DateModeToggle />

      {lc ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <CategoryGroups
          categories={categories}
          groups={groups}
          transactions={transactions}
          typeMap={typeMap}
          billEntries={bills}
          incomeEntries={incomes}
          ctx={ctx}
          onChanged={mutateCategories}
        />
      )}
    </div>
  )
}
