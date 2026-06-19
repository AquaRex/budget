"use client"

import { useMemo, useState } from "react"
import { ChevronLeft, ChevronRight, Tags } from "lucide-react"

import { MONTHS_LONG } from "@/lib/budget"
import { buildTypeMap } from "@/lib/spending"
import {
  useEntries,
  useAmounts,
  useSalaryProfile,
  useBudgetContext,
  useCategories,
  useTransactions,
  useTxRules,
  useTypeCategories,
} from "@/lib/data/use-budget"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Separator } from "@/components/ui/separator"
import { CsvDropzone } from "@/components/spending/csv-dropzone"
import { SpendingSummary } from "@/components/spending/spending-summary"
import { TransactionsTable } from "@/components/spending/transactions-table"
import { TypeMapper } from "@/components/spending/type-mapper"

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}

export default function SpendingPage() {
  const { entries: bills } = useEntries("bill")
  const { amounts } = useAmounts()
  const { profile } = useSalaryProfile()
  const { categories, mutate: mutateCategories } = useCategories()
  const ctx = useBudgetContext(amounts, profile)
  const {
    transactions,
    isLoading: lt,
    mutate: mutateTx,
  } = useTransactions()
  const { rules, mutate: mutateRules } = useTxRules()
  const { typeCategories, mutate: mutateTypeCats } = useTypeCategories()
  const typeMap = useMemo(() => buildTypeMap(typeCategories), [typeCategories])
  const [mapperOpen, setMapperOpen] = useState(false)

  // Months that actually have data, newest first.
  const periods = useMemo(() => {
    const set = new Set<string>()
    for (const t of transactions) set.add(t.booked_date.slice(0, 7))
    return Array.from(set).sort((a, b) => b.localeCompare(a))
  }, [transactions])

  // "all" = every transaction; otherwise a "YYYY-MM" key.
  const [period, setPeriod] = useState<string | null>(null)
  const active = period ?? periods[0] ?? monthKey(new Date())
  const isAll = active === "all"
  const idx = periods.indexOf(active)

  // periods are newest-first; stepping forward in time = toward index 0.
  const stepPeriod = (deltaTime: number) => {
    if (periods.length === 0 || isAll) return
    const next = Math.min(Math.max(idx - deltaTime, 0), periods.length - 1)
    setPeriod(periods[next])
  }

  const monthNum = isAll ? 0 : Number(active.slice(5, 7))
  const yearNum = isAll ? "" : active.slice(0, 4)
  const inPeriod = useMemo(
    () =>
      isAll
        ? transactions
        : transactions.filter((t) => t.booked_date.slice(0, 7) === active),
    [transactions, active, isAll],
  )
  // Budget is the recurring template; over "all" sum each covered month.
  const budgetMonths = isAll
    ? periods.map((p) => Number(p.slice(5, 7)))
    : [monthNum]

  const refresh = () => {
    mutateTx()
    mutateRules()
    mutateTypeCats()
    mutateCategories()
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Spending</h1>
          <p className="text-muted-foreground text-sm">
            Actual transactions from your bank, against your budget.
          </p>
        </div>
        {periods.length > 0 && (
          <div className="flex items-center gap-2">
            <div className="flex items-center rounded-md border">
              <Button
                variant="ghost"
                size="icon"
                aria-label="Older month"
                onClick={() => stepPeriod(-1)}
                disabled={isAll || idx >= periods.length - 1}
              >
                <ChevronLeft className="size-4" />
              </Button>
              <span className="w-32 text-center text-sm font-medium">
                {isAll ? "All time" : `${MONTHS_LONG[monthNum - 1]} ${yearNum}`}
              </span>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Newer month"
                onClick={() => stepPeriod(1)}
                disabled={isAll || idx <= 0}
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
            <Button
              variant={isAll ? "default" : "outline"}
              size="sm"
              onClick={() => setPeriod(isAll ? periods[0] : "all")}
            >
              All time
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setMapperOpen(true)}
            >
              <Tags className="size-4" />
              Bank categories
            </Button>
          </div>
        )}
      </div>

      <CsvDropzone
        transactions={transactions}
        rules={rules}
        onImported={refresh}
      />

      {lt ? (
        <Skeleton className="h-40 w-full" />
      ) : transactions.length === 0 ? null : (
        <>
          <SpendingSummary
            transactions={inPeriod}
            bills={bills}
            ctx={ctx}
            months={budgetMonths}
            categories={categories}
            typeMap={typeMap}
          />

          <Separator className="my-1" />

          <div className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold tracking-tight">
              Transactions —{" "}
              {isAll ? "All time" : `${MONTHS_LONG[monthNum - 1]} ${yearNum}`}
            </h2>
            <TransactionsTable
              transactions={inPeriod}
              categories={categories}
              typeMap={typeMap}
              onChanged={refresh}
            />
          </div>
        </>
      )}

      <TypeMapper
        open={mapperOpen}
        onOpenChange={setMapperOpen}
        transactions={transactions}
        categories={categories}
        typeCategories={typeCategories}
        onChanged={refresh}
      />
    </div>
  )
}
