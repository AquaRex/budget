"use client"

import { useMemo } from "react"
import Link from "next/link"
import { SlidersHorizontal } from "lucide-react"

import { buildTypeMap } from "@/lib/spending"
import { computeGroupsMatrix } from "@/lib/stats/groups"
import { useDashboardStats, useStatsData } from "@/lib/stats/use-dashboard-stats"
import { useYear } from "@/lib/year"
import {
  useEntries,
  useCategories,
  useTransactions,
  useTypeCategories,
} from "@/lib/data/use-budget"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { GroupsGrid } from "@/components/groups/groups-grid"
import { GroupsSummary } from "@/components/groups/groups-summary"

export default function GroupsPage() {
  const year = useYear()
  const activeYear = String(year)
  const { entries: bills } = useEntries("bill")
  const { entries: incomes } = useEntries("income")
  const { categories } = useCategories()
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

  // Month status (complete / current / future…) decides which differences are judged.
  const stats = useDashboardStats({
    year,
    month: 1,
    scope: "year",
    includeIncomplete: true,
  })
  const { data: statsData } = useStatsData()
  const { months: statuses, bands } = useMemo(
    () => computeGroupsMatrix(statsData, year, stats.today),
    [statsData, year, stats.today],
  )

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h1 className="text-2xl font-semibold tracking-tight">Groups</h1>
          <p className="text-muted-foreground text-sm">
            Actual spending per group against its budget, month by month.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/settings">
            <SlidersHorizontal className="size-4" />
            Configure
          </Link>
        </Button>
      </div>

      {lt || stats.loading ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <div className="flex flex-col gap-6">
          {groups.length > 0 && (
            <GroupsSummary bands={bands} statuses={statuses} year={activeYear} />
          )}
          <GroupsGrid
            transactions={transactions}
            groups={groups}
            categories={categories}
            typeMap={typeMap}
            year={activeYear}
            statuses={statuses}
            bands={bands}
          />
        </div>
      )}
    </div>
  )
}
