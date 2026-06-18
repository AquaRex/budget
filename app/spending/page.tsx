"use client"

import { useMemo, useState } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"

import { MONTHS_LONG } from "@/lib/budget"
import {
  useEntries,
  useAmounts,
  useSalaryProfile,
  useBudgetContext,
  useCategories,
  useTransactions,
  useTxRules,
} from "@/lib/data/use-budget"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Separator } from "@/components/ui/separator"
import { CsvDropzone } from "@/components/spending/csv-dropzone"
import { SpendingSummary } from "@/components/spending/spending-summary"
import { TransactionsTable } from "@/components/spending/transactions-table"

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}

export default function SpendingPage() {
  const { entries: bills } = useEntries("bill")
  const { amounts } = useAmounts()
  const { profile } = useSalaryProfile()
  const { categories } = useCategories("bill")
  const ctx = useBudgetContext(amounts, profile)
  const {
    transactions,
    isLoading: lt,
    mutate: mutateTx,
  } = useTransactions()
  const { rules, mutate: mutateRules } = useTxRules()

  // Months that actually have data, newest first.
  const periods = useMemo(() => {
    const set = new Set<string>()
    for (const t of transactions) set.add(t.booked_date.slice(0, 7))
    return Array.from(set).sort((a, b) => b.localeCompare(a))
  }, [transactions])

  const [period, setPeriod] = useState<string | null>(null)
  const active = period ?? periods[0] ?? monthKey(new Date())
  const idx = periods.indexOf(active)

  const stepPeriod = (delta: number) => {
    if (periods.length === 0) return
    const next = Math.min(Math.max(idx + delta, 0), periods.length - 1)
    setPeriod(periods[next])
  }

  const monthNum = Number(active.slice(5, 7))
  const yearNum = active.slice(0, 4)
  const inPeriod = useMemo(
    () => transactions.filter((t) => t.booked_date.slice(0, 7) === active),
    [transactions, active],
  )

  const refresh = () => {
    mutateTx()
    mutateRules()
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
          <div className="flex items-center rounded-md border">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Newer month"
              onClick={() => stepPeriod(-1)}
              disabled={idx <= 0}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <span className="w-32 text-center text-sm font-medium">
              {MONTHS_LONG[monthNum - 1]} {yearNum}
            </span>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Older month"
              onClick={() => stepPeriod(1)}
              disabled={idx >= periods.length - 1}
            >
              <ChevronRight className="size-4" />
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
            month={monthNum}
            categories={categories}
          />

          <Separator className="my-1" />

          <div className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold tracking-tight">
              Transactions — {MONTHS_LONG[monthNum - 1]} {yearNum}
            </h2>
            <TransactionsTable
              transactions={inPeriod}
              categories={categories}
              onChanged={refresh}
            />
          </div>
        </>
      )}
    </div>
  )
}
