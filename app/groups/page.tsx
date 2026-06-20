"use client"

import { useMemo, useState } from "react"
import { SlidersHorizontal } from "lucide-react"

import { buildGroupMap } from "@/lib/spending"
import {
  useEntries,
  useAmounts,
  useSalaryProfile,
  useBudgetContext,
  useCategories,
  useTransactions,
  useTypeGroups,
} from "@/lib/data/use-budget"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { GroupsGrid } from "@/components/groups/groups-grid"
import { GroupMapper } from "@/components/groups/group-mapper"

export default function GroupsPage() {
  const { entries: bills } = useEntries("bill")
  const { entries: incomes } = useEntries("income")
  const { amounts } = useAmounts()
  const { profile } = useSalaryProfile()
  const { categories, mutate: mutateCategories } = useCategories()
  const ctx = useBudgetContext(amounts, profile)
  const { transactions, isLoading: lt, mutate: mutateTx } = useTransactions()
  const { typeGroups, mutate: mutateTypeGroups } = useTypeGroups()
  const groupMap = useMemo(() => buildGroupMap(typeGroups), [typeGroups])
  const [mapperOpen, setMapperOpen] = useState(false)

  const groups = useMemo(
    () => categories.filter((c) => c.is_group),
    [categories],
  )

  // Years with transaction data, newest first.
  const years = useMemo(() => {
    const set = new Set<string>()
    for (const t of transactions) set.add(t.booked_date.slice(0, 4))
    return Array.from(set).sort((a, b) => b.localeCompare(a))
  }, [transactions])
  const [gridYear, setGridYear] = useState<string | null>(null)
  const activeYear = gridYear ?? years[0] ?? String(new Date().getFullYear())

  const refresh = () => {
    mutateCategories()
    mutateTypeGroups()
    mutateTx()
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Groups</h1>
          <p className="text-muted-foreground text-sm">
            Budgeted vs actual, rolled up into your own groups.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setMapperOpen(true)}>
          <SlidersHorizontal className="size-4" />
          Configure groups
        </Button>
      </div>

      {lt ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <div className="flex flex-col gap-4">
          {years.length > 0 && (
            <div className="flex flex-wrap items-center justify-end gap-1">
              {years.map((y) => (
                <Button
                  key={y}
                  variant={y === activeYear ? "default" : "outline"}
                  size="sm"
                  onClick={() => setGridYear(y)}
                >
                  {y}
                </Button>
              ))}
            </div>
          )}
          <GroupsGrid
            transactions={transactions}
            groups={groups}
            groupMap={groupMap}
            billEntries={bills}
            incomeEntries={incomes}
            ctx={ctx}
            year={activeYear}
          />
        </div>
      )}

      <GroupMapper
        open={mapperOpen}
        onOpenChange={setMapperOpen}
        transactions={transactions}
        categories={categories}
        typeGroups={typeGroups}
        onChanged={refresh}
      />
    </div>
  )
}
