"use client"

import { useEffect, useMemo, useState } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"

import { MONTHS_LONG } from "@/lib/budget"
import { cn } from "@/lib/utils"
import { buildTypeMap, effectiveDate } from "@/lib/spending"
import { buildGroupIndex, isSavingsTx } from "@/lib/stats/flows"
import { useYear, setYear } from "@/lib/year"
import {
  useEntries,
  useAmounts,
  useSalaryProfile,
  useBudgetContext,
  useCategories,
  useLabels,
  useTransactions,
  useTxRules,
  useTypeCategories,
} from "@/lib/data/use-budget"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { CsvDropzone } from "@/components/spending/csv-dropzone"
import { SpendingSummary } from "@/components/spending/spending-summary"
import { TransactionsTable } from "@/components/spending/transactions-table"
import { ActualsGrid, type DrillMode } from "@/components/spending/actuals-grid"

type Scope = "month" | "year" | "all"

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}

export default function SpendingPage() {
  const { entries: bills } = useEntries("bill")
  const { amounts } = useAmounts()
  const { profile } = useSalaryProfile()
  const { categories, mutate: mutateCategories } = useCategories()
  const { labels, mutate: mutateLabels } = useLabels()
  const ctx = useBudgetContext(amounts, profile)
  const { transactions, isLoading: lt, mutate: mutateTx } = useTransactions()
  const { rules, mutate: mutateRules } = useTxRules()
  const { typeCategories, mutate: mutateTypeCats } = useTypeCategories()
  const typeMap = useMemo(() => buildTypeMap(typeCategories), [typeCategories])
  const { entries: incomes } = useEntries("income")

  // Savings-group rows and budgets are set aside, not spent — same rule as the
  // dashboard — so the spending/income views leave them out.
  const groupIndex = useMemo(
    () => buildGroupIndex(categories, labels, typeMap, bills, incomes),
    [categories, labels, typeMap, bills, incomes],
  )
  const unsaved = useMemo(
    () => transactions.filter((t) => !isSavingsTx(t, groupIndex)),
    [transactions, groupIndex],
  )
  const spendingBills = useMemo(
    () => bills.filter((e) => !e.category_id || !groupIndex.savings.has(e.category_id)),
    [bills, groupIndex],
  )

  // Months that actually have data, newest first (for the Transactions tab).
  const periods = useMemo(() => {
    const set = new Set<string>()
    for (const t of transactions) set.add(effectiveDate(t).slice(0, 7))
    return Array.from(set).sort((a, b) => b.localeCompare(a))
  }, [transactions])

  const dataYears = useMemo(
    () => Array.from(new Set(periods.map((p) => p.slice(0, 4)))),
    [periods],
  )

  // "all" = every transaction; "YYYY" = a year; otherwise a "YYYY-MM" key.
  const [period, setPeriod] = useState<string | null>(null)
  const active = period ?? periods[0] ?? monthKey(new Date())
  const isAll = active === "all"
  const isYear = active.length === 4
  const scope: Scope = isAll ? "all" : isYear ? "year" : "month"
  const steps = isYear ? dataYears : periods
  const idx = steps.indexOf(active)

  const stepPeriod = (deltaTime: number) => {
    if (steps.length === 0 || isAll) {
      return
    }
    const next = Math.min(Math.max(idx - deltaTime, 0), steps.length - 1)
    setPeriod(steps[next])
  }

  const changeScope = (next: Scope) => {
    if (next === scope) {
      return
    }
    if (next === "all") {
      setPeriod("all")
    } else if (next === "year") {
      setPeriod(isAll ? (dataYears[0] ?? active) : active.slice(0, 4))
    } else if (isYear) {
      setPeriod(periods.find((p) => p.startsWith(active)) ?? periods[0])
    } else {
      setPeriod(periods[0])
    }
  }

  const monthNum = isAll || isYear ? 0 : Number(active.slice(5, 7))
  const yearNum = isAll ? "" : active.slice(0, 4)
  // A period holding the current month is still running: no budget verdict yet.
  const thisMonth = monthKey(new Date())
  const inProgress = isAll
    ? periods.includes(thisMonth)
    : thisMonth.startsWith(active) || active > thisMonth
  const periodLabel = isAll
    ? "All time"
    : isYear
      ? active
      : `${MONTHS_LONG[monthNum - 1]} ${yearNum}`
  const inPeriod = useMemo(
    () =>
      isAll
        ? transactions
        : transactions.filter((t) => effectiveDate(t).startsWith(active)),
    [transactions, active, isAll],
  )
  const unsavedInPeriod = useMemo(
    () => inPeriod.filter((t) => !isSavingsTx(t, groupIndex)),
    [inPeriod, groupIndex],
  )
  const budgetMonths = isAll
    ? periods.map((p) => Number(p.slice(5, 7)))
    : isYear
      ? periods
          .filter((p) => p.startsWith(active))
          .map((p) => Number(p.slice(5, 7)))
      : [monthNum]

  // Bills/Income grids follow the global year selector.
  const globalYear = useYear()
  const activeYear = String(globalYear)

  // Active sub-tab and the transaction-list search (controlled so the Bills/
  // Income grids can drill into a specific merchant + month).
  const [tab, setTab] = useState("transactions")
  const [txQuery, setTxQuery] = useState("")
  const [highlight, setHighlight] = useState<{
    merchant: string
    period: string
  } | null>(null)
  const [catFilter, setCatFilter] = useState<string | null>(null)
  const [labelFilter, setLabelFilter] = useState<string | null>(null)
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
    const label = sp.get("label")
    if (!p && q == null && !tb && !cat && !label) return
    window.history.replaceState(null, "", window.location.pathname)
    // Defer so we're not setting state synchronously inside the effect.
    queueMicrotask(() => {
      if (tb) setTab(tb)
      if (p && /^(all|\d{4}|\d{4}-(0[1-9]|1[0-2]))$/.test(p)) {
        setPeriod(p)
      }
      if (cat) setCatFilter(cat)
      if (label) setLabelFilter(label)
      if (q != null) {
        setTxQuery(q)
        setHighlight(null)
      }
    })
  }, [])

  // Left/right arrow keys step the month (Transactions) or year (Bills/Income).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return
      const el = e.target as HTMLElement | null
      if (el && /^(input|textarea|select)$/i.test(el.tagName)) return
      if (document.querySelector('[role="dialog"]')) return
      const back = e.key === "ArrowLeft"
      if (el?.closest('[role="radiogroup"]')) {
        return
      }
      if (tab === "transactions") {
        if (isAll || steps.length === 0) {
          return
        }
        setPeriod(
          steps[Math.min(Math.max(idx + (back ? 1 : -1), 0), steps.length - 1)],
        )
      } else {
        setYear(globalYear + (back ? -1 : 1))
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [tab, steps, idx, isAll, globalYear])

  const refresh = () => {
    mutateTx()
    mutateRules()
    mutateTypeCats()
    mutateCategories()
    mutateLabels()
  }

  const stepper = (
    label: string,
    onStep: (delta: number) => void,
    canBack: boolean,
    canForward: boolean,
  ) => (
    <div className="flex items-center border">
      <Button
        variant="ghost"
        size="icon-sm"
        className="size-11 sm:size-9"
        aria-label="Previous"
        onClick={() => onStep(-1)}
        disabled={!canBack}
      >
        <ChevronLeft className="size-4" />
      </Button>
      <span className="w-24 text-center text-xs font-semibold tracking-widest uppercase tabular-nums sm:w-28">
        {label}
      </span>
      <Button
        variant="ghost"
        size="icon-sm"
        className="size-11 sm:size-9"
        aria-label="Next"
        onClick={() => onStep(1)}
        disabled={!canForward}
      >
        <ChevronRight className="size-4" />
      </Button>
    </div>
  )

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h1 className="text-2xl font-semibold tracking-tight">Spending</h1>
          <p className="text-muted-foreground text-sm">
            Your imported bank transactions and where each one is categorised.
          </p>
        </div>
        {(lt || transactions.length > 0) && (
          <CsvDropzone rules={rules} onImported={refresh} />
        )}
      </div>

      {lt ? (
        <Skeleton className="h-40 w-full" />
      ) : transactions.length === 0 ? (
        <CsvDropzone rules={rules} onImported={refresh} large />
      ) : (
        <Tabs value={tab} onValueChange={setTab} className="gap-6">
          <div className="bg-background/95 supports-backdrop-filter:backdrop-blur sticky top-14 z-10 -mx-4 flex flex-wrap items-center justify-between gap-3 border-b px-4 py-2 sm:-mx-6 sm:px-6">
            <TabsList>
              <TabsTrigger value="transactions">Transactions</TabsTrigger>
              <TabsTrigger value="bills">Bills</TabsTrigger>
              <TabsTrigger value="income">Income</TabsTrigger>
            </TabsList>
            {tab === "transactions" ? (
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex border" role="radiogroup" aria-label="Period">
                  {(["month", "year", "all"] as Scope[]).map((sc) => (
                    <button
                      key={sc}
                      role="radio"
                      aria-checked={scope === sc}
                      onClick={() => changeScope(sc)}
                      className={cn(
                        "h-11 px-3 text-xs font-semibold tracking-widest uppercase transition-colors sm:h-9",
                        scope === sc
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {sc}
                    </button>
                  ))}
                </div>
                {!isAll &&
                  stepper(
                    isYear
                      ? active
                      : `${MONTHS_LONG[monthNum - 1].slice(0, 3)} ${yearNum}`,
                    stepPeriod,
                    idx < steps.length - 1,
                    idx > 0,
                  )}
              </div>
            ) : (
              stepper(activeYear, (d) => setYear(globalYear + d), true, true)
            )}
          </div>

          <TabsContent value="transactions" className="flex flex-col gap-6">
            <SpendingSummary
              transactions={unsavedInPeriod}
              bills={spendingBills}
              ctx={ctx}
              months={budgetMonths}
              typeMap={typeMap}
              periodLabel={periodLabel}
              inProgress={inProgress}
            />

            <div className="flex flex-col gap-3">
              <h2 className="text-muted-foreground text-[11px] font-semibold tracking-widest uppercase">
                Transactions · {periodLabel}
              </h2>
              <TransactionsTable
                transactions={inPeriod}
                categories={categories}
                labels={labels}
                typeMap={typeMap}
                query={txQuery}
                onQueryChange={handleQueryChange}
                highlight={highlight}
                categoryFilter={catFilter}
                labelFilter={labelFilter}
                onClearCategoryFilter={() => setCatFilter(null)}
                onClearLabelFilter={() => setLabelFilter(null)}
                onChanged={refresh}
                onLabelsChanged={mutateLabels}
              />
            </div>
          </TabsContent>

          <TabsContent value="bills">
            <ActualsGrid
              transactions={unsaved}
              categories={categories}
              typeMap={typeMap}
              kind="bill"
              year={activeYear}
              onDrill={drillTo}
            />
          </TabsContent>

          <TabsContent value="income">
            <ActualsGrid
              transactions={unsaved}
              categories={categories}
              typeMap={typeMap}
              kind="income"
              year={activeYear}
              onDrill={drillTo}
            />
          </TabsContent>
        </Tabs>
      )}
    </div>
  )
}
