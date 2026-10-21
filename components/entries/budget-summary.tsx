"use client"

import { MONTHS_SHORT, monthTotal } from "@/lib/budget"
import type { Entry } from "@/lib/types"
import { cn } from "@/lib/utils"
import { useYear } from "@/lib/year"
import {
  useAmounts,
  useBudgetContext,
  useCategories,
  useEntries,
  useSalaryProfile,
} from "@/lib/data/use-budget"
import { Skeleton } from "@/components/ui/skeleton"
import { Panel } from "@/components/stats/panel"
import { compact, down, kr, pct, signedKr, up } from "@/components/stats/display"

/** The year's plan at a glance: income, bills, savings and what's left. */
export function BudgetSummary() {
  const year = useYear()
  const { entries: bills, isLoading: lb } = useEntries("bill")
  const { entries: incomes, isLoading: li } = useEntries("income")
  const { amounts, isLoading: la } = useAmounts()
  const { profile } = useSalaryProfile()
  const { categories } = useCategories()
  const ctx = useBudgetContext(amounts, profile)

  if (lb || li || la) {
    return <Skeleton className="h-52 w-full" />
  }

  // Bills in a savings group are money set aside, not spent (as on the dashboard).
  const savingsIds = new Set(
    categories.filter((c) => c.is_savings).map((c) => c.id),
  )
  const isSavings = (e: Entry) => !!e.category_id && savingsIds.has(e.category_id)
  const spendBills = bills.filter((e) => !isSavings(e))
  const saveBills = bills.filter(isSavings)

  const months = MONTHS_SHORT.map((label, i) => {
    const income = monthTotal(incomes, ctx, i + 1)
    const spend = monthTotal(spendBills, ctx, i + 1)
    const save = monthTotal(saveBills, ctx, i + 1)
    return { label, income, spend, save, left: income - spend - save }
  })
  const total = (key: "income" | "spend" | "save" | "left") =>
    months.reduce((s, m) => s + m[key], 0)
  const income = total("income")
  const spend = total("spend")
  const save = total("save")
  const left = total("left")
  const now = new Date()
  const currentMonth = now.getFullYear() === year ? now.getMonth() : -1

  const figures = [
    {
      label: "Income",
      value: kr(income),
      tone: up,
      hint: `≈ ${kr(income / 12)} / month`,
    },
    {
      label: "Bills",
      value: kr(spend),
      tone: "",
      hint: income > 0 ? `${pct(spend / income)} of income` : "—",
    },
    {
      label: "To savings",
      value: kr(save),
      tone: "",
      hint:
        income > 0
          ? `${pct(save / income)} of income`
          : "Mark a group as savings in Settings",
    },
    {
      label: "Left",
      value: signedKr(left),
      tone: left >= 0 ? up : down,
      hint: `≈ ${signedKr(left / 12)} / month`,
    },
  ]

  return (
    <Panel
      title={`Budget · ${year}`}
      subtitle="What the sheet below plans for the year"
    >
      <div className="flex flex-col gap-5">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-4 lg:grid-cols-4">
          {figures.map((f) => (
            <div key={f.label} className="flex min-w-0 flex-col gap-0.5">
              <dt className="text-muted-foreground text-xs font-medium">
                {f.label}
              </dt>
              <dd
                className={cn(
                  "truncate text-2xl font-semibold tracking-tight tabular-nums",
                  f.tone,
                )}
              >
                {f.value}
              </dd>
              <dd className="text-muted-foreground text-[11px] tabular-nums">
                {f.hint}
              </dd>
            </div>
          ))}
        </dl>

        <div className="flex flex-col gap-2">
          <span className="text-muted-foreground text-[11px] font-semibold tracking-widest uppercase">
            Left each month
          </span>
          <ol className="grid grid-cols-6 gap-px border bg-border md:grid-cols-12">
            {months.map((m, i) => (
              <li
                key={m.label}
                title={`${m.label}: income ${kr(m.income)} − bills ${kr(m.spend)} − savings ${kr(m.save)} = ${signedKr(m.left)}`}
                className={cn(
                  "bg-card flex flex-col items-center gap-0.5 px-1 py-2",
                  m.left < 0 && "bg-rose-500/10",
                  i === currentMonth && "ring-primary ring-2 ring-inset",
                )}
              >
                <span className="text-muted-foreground text-[10px] font-semibold tracking-wider uppercase">
                  {m.label}
                </span>
                <span
                  className={cn(
                    "text-sm font-semibold tabular-nums",
                    m.left < 0 ? down : m.left > 0 ? up : "text-muted-foreground",
                  )}
                >
                  {m.left < 0 ? "−" : ""}
                  {compact(Math.abs(m.left))}
                </span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </Panel>
  )
}
