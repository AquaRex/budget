"use client"

import { useMemo } from "react"
import Link from "next/link"
import { SlidersHorizontal } from "lucide-react"

import { buildTypeMap } from "@/lib/spending"
import { useYear } from "@/lib/year"
import {
  useEntries,
  useAmounts,
  useSalaryProfile,
  useBudgetContext,
  useCategories,
  useLabels,
  useTransactions,
  useTypeCategories,
} from "@/lib/data/use-budget"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { GroupsGrid } from "@/components/groups/groups-grid"

export default function GroupsPage() {
  const activeYear = String(useYear())
  const { entries: bills } = useEntries("bill")
  const { entries: incomes } = useEntries("income")
  const { amounts } = useAmounts()
  const { profile } = useSalaryProfile()
  const { categories } = useCategories()
  const { labels } = useLabels()
  const ctx = useBudgetContext(amounts, profile)
  const { transactions, isLoading: lt } = useTransactions()
  const { typeCategories } = useTypeCategories()
  const typeMap = useMemo(() => buildTypeMap(typeCategories), [typeCategories])

  // Groups are auto-derived: any category that a Bills/Income entry uses.
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Groups</h1>
        <Button asChild variant="outline" size="sm">
          <Link href="/settings">
            <SlidersHorizontal className="size-4" />
            Configure
          </Link>
        </Button>
      </div>

      {lt ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <div className="flex flex-col gap-4">
          <GroupsGrid
            transactions={transactions}
            groups={groups}
            categories={categories}
            labels={labels}
            typeMap={typeMap}
            billEntries={bills}
            incomeEntries={incomes}
            ctx={ctx}
            year={activeYear}
          />
        </div>
      )}
    </div>
  )
}
