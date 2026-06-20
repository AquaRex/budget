"use client"

import { useEffect, useMemo, useState } from "react"
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { CsvDropzone } from "@/components/spending/csv-dropzone"
import { SpendingSummary } from "@/components/spending/spending-summary"
import { TransactionsTable } from "@/components/spending/transactions-table"
import { TypeMapper } from "@/components/spending/type-mapper"
import { ActualsGrid, type DrillMode } from "@/components/spending/actuals-grid"

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}

export default function SpendingPage() {
  const { entries: bills } = useEntries("bill")
  const { amounts } = useAmounts()
  const { profile } = useSalaryProfile()
  const { categories, mutate: mutateCategories } = useCategories()
  const ctx = useBudgetContext(amounts, profile)
  const { transactions, isLoading: lt, mutate: mutateTx } = useTransactions()
  const { rules, mutate: mutateRules } = useTxRules()
  const { typeCategories, mutate: mutateTypeCats } = useTypeCategories()
  const typeMap = useMemo(() => buildTypeMap(typeCategories), [typeCategories])
  const [mapperOpen, setMapperOpen] = useState(false)

  // Months that actually have data, newest first (for the Transactions tab).
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
  const budgetMonths = isAll
    ? periods.map((p) => Number(p.slice(5, 7)))
    : [monthNum]

  // Years with data (for the Bills/Income year grids), newest first.
  const years = useMemo(() => {
    const set = new Set<string>()
    for (const t of transactions) set.add(t.booked_date.slice(0, 4))
    return Array.from(set).sort((a, b) => b.localeCompare(a))
  }, [transactions])
  const [gridYear, setGridYear] = useState<string | null>(null)
  const activeYear = gridYear ?? years[0] ?? String(new Date().getFullYear())

  // Active sub-tab and the transaction-list search (controlled so the Bills/
  // Income grids can drill into a specific merchant + month).
  const [tab, setTab] = useState("transactions")
  const [txQuery, setTxQuery] = useState("")
  const [highlight, setHighlight] = useState<{
    merchant: string
    period: string
  } | null>(null)
  const [catFilter, setCatFilter] = useState<string | null>(null)
  // Drill from a Bills/Income cell. "filter" (quick click) shows just that
  // cell's items (merchant + month). "full" (click-and-hold) opens the All-time
  // list and scrolls to / highlights that item.
  const drillTo = (period: string, merchant: string, mode: DrillMode) => {
    if (mode === "full") {
      setPeriod("all")
      setTxQuery("")
      setHighlight({ merchant, period })
    } else {
      setPeriod(period)
      setTxQuery(merchant)
      setHighlight(null)
    }
    setTab("transactions")
  }
  const handleQueryChange = (q: string) => {
    setTxQuery(q)
    setHighlight(null) // typing a search clears the drill highlight
  }

  // Honour a drill from another page (e.g. the Groups calendar):
  // /spending?tab=transactions&period=YYYY-MM&q=<merchant>.
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search)
    const p = sp.get("period")
    const q = sp.get("q")
    const tb = sp.get("tab")
    const cat = sp.get("cat")
    if (!p && q == null && !tb && !cat) return
    window.history.replaceState(null, "", window.location.pathname)
    // Defer so we're not setting state synchronously inside the effect.
    queueMicrotask(() => {
      if (tb) setTab(tb)
      if (p) setPeriod(p)
      if (cat) setCatFilter(cat)
      if (q != null) {
        setTxQuery(q)
        setHighlight(null)
      }
    })
  }, [])

  const refresh = () => {
    mutateTx()
    mutateRules()
    mutateTypeCats()
    mutateCategories()
  }

  const yearPicker = (
    <div className="flex flex-wrap items-center gap-1">
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
  )

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Spending</h1>
          <p className="text-muted-foreground text-sm">
            Actual transactions from your bank, against your budget.
          </p>
        </div>
        {transactions.length > 0 && (
          <Button variant="outline" size="sm" onClick={() => setMapperOpen(true)}>
            <Tags className="size-4" />
            Bank categories
          </Button>
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
        <Tabs value={tab} onValueChange={setTab} className="gap-6">
          <TabsList>
            <TabsTrigger value="transactions">Transactions</TabsTrigger>
            <TabsTrigger value="bills">Bills</TabsTrigger>
            <TabsTrigger value="income">Income</TabsTrigger>
          </TabsList>

          <TabsContent value="transactions" className="flex flex-col gap-6">
            <div className="flex flex-wrap items-center justify-end gap-2">
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
            </div>

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
                query={txQuery}
                onQueryChange={handleQueryChange}
                highlight={highlight}
                categoryFilter={catFilter}
                onClearCategoryFilter={() => setCatFilter(null)}
                onChanged={refresh}
              />
            </div>
          </TabsContent>

          <TabsContent value="bills" className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-muted-foreground text-sm">
                What you actually spent, by category, per month.
              </p>
              {yearPicker}
            </div>
            <ActualsGrid
              transactions={transactions}
              categories={categories}
              typeMap={typeMap}
              kind="bill"
              year={activeYear}
              onDrill={drillTo}
            />
          </TabsContent>

          <TabsContent value="income" className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-muted-foreground text-sm">
                What actually came in, by category, per month.
              </p>
              {yearPicker}
            </div>
            <ActualsGrid
              transactions={transactions}
              categories={categories}
              typeMap={typeMap}
              kind="income"
              year={activeYear}
              onDrill={drillTo}
            />
          </TabsContent>
        </Tabs>
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
