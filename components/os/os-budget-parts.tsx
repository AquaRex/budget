"use client"

import { useState } from "react"
import Link from "next/link"
import { ArrowUpRight } from "lucide-react"
import { toast } from "sonner"

import type { Category, Entry } from "@/lib/types"
import { isFilledEveryMonth, MONTHS_LONG } from "@/lib/budget"
import { setAmount } from "@/lib/data/entries"
import { useAmounts, useBudgetYears } from "@/lib/data/use-budget"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { kr } from "@/components/stats/display"

export type Kind = "income" | "bill" | "savings"
export type Group = { key: string; title: string; kind: Kind; entries: Entry[] }

/** Active entries by budget section: income first, then a section per bill group. */
export function groupEntries(
  incomes: Entry[],
  bills: Entry[],
  categories: Category[],
): Group[] {
  const groups: Group[] = [
    {
      key: "income",
      title: "Income",
      kind: "income",
      entries: incomes.filter((e) => e.is_active),
    },
  ]
  const byCategory = new Map<string, Entry[]>()
  for (const e of bills.filter((b) => b.is_active)) {
    const key = e.category_id ?? "none"
    byCategory.set(key, [...(byCategory.get(key) ?? []), e])
  }
  for (const [key, entries] of byCategory) {
    const cat = categories.find((c) => c.id === key)
    groups.push({
      key,
      title: cat?.name ?? "No group",
      kind: cat?.is_savings ? "savings" : "bill",
      entries,
    })
  }
  return groups
}

export function kindOrder(kind: Kind) {
  return kind === "income" ? 0 : kind === "bill" ? 1 : 2
}

export function Figure({
  label,
  value,
  sub,
  className,
  big = false,
}: {
  label: string
  value: string
  sub?: string
  className?: string
  big?: boolean
}) {
  return (
    <div className="flex min-w-0 flex-col">
      <span className="text-muted-foreground text-[11px] font-semibold tracking-widest uppercase">
        {label}
      </span>
      <span
        className={cn(
          "truncate font-semibold tracking-tight",
          big ? "text-2xl" : "text-xl",
          className,
        )}
      >
        {value}
      </span>
      {sub && (
        <span className="text-muted-foreground truncate text-xs tabular-nums">
          {sub}
        </span>
      )}
    </div>
  )
}

export function WebsiteLink() {
  return (
    <Link
      href="/budget"
      className="text-muted-foreground flex min-h-11 items-center justify-center gap-2 text-xs"
    >
      <ArrowUpRight className="size-4" aria-hidden /> Edit the whole year on
      the website
    </Link>
  )
}

/** A year without budget entries: the website's Budget page can start it. */
export function EmptyBudget({ year }: { year: number }) {
  const { years } = useBudgetYears()
  const earlier = years.filter((y) => y < year)
  const source = earlier.length > 0 ? Math.max(...earlier) : null

  return (
    <section className="bg-card ring-foreground/5 flex flex-col gap-3 p-5 shadow-sm ring-1">
      <h2 className="text-base font-semibold">{year} has no budget yet.</h2>
      <p className="text-muted-foreground text-sm">
        {source
          ? `Open the Budget page on the website and tap “Copy ${source} into ${year}” to start from last year’s bills, income and salary.`
          : "Build it on the Budget page on the website."}
      </p>
      <Button asChild size="lg" variant="outline">
        <Link href="/budget">
          <ArrowUpRight className="size-4" aria-hidden /> Open the Budget page
        </Link>
      </Button>
    </section>
  )
}

/** Set one month's amount, or clear its override back to the usual amount. */
export function AmountForm({
  entry,
  year,
  month,
  amount,
  overridden,
  onDone,
}: {
  entry: Entry
  year: number
  month: number
  amount: number
  overridden: boolean
  onDone: () => void
}) {
  const { mutate } = useAmounts()
  const [value, setValue] = useState("")
  const [saving, setSaving] = useState(false)

  async function save(next: number | null) {
    setSaving(true)
    try {
      await setAmount(entry.id, year, month, next)
      await mutate()
      toast.success("Budget updated")
      onDone()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save.")
    } finally {
      setSaving(false)
    }
  }

  const parsed = Number(value.replace(/\s/g, "").replace(",", "."))
  const valid = value.trim() !== "" && Number.isFinite(parsed) && parsed >= 0

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault()
        if (valid) {
          // Like the desktop grid: 0 clears the month's override.
          void save(parsed === 0 ? null : parsed)
        }
      }}
    >
      <Input
        autoFocus
        inputMode="decimal"
        placeholder={String(Math.round(amount))}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="h-12 text-lg tabular-nums"
        aria-label={`${entry.name} amount for ${MONTHS_LONG[month - 1]}`}
      />
      <Button type="submit" size="lg" disabled={!valid || saving}>
        Save for {MONTHS_LONG[month - 1]}
      </Button>
      <Button
        type="button"
        variant="outline"
        size="lg"
        disabled={saving || !overridden}
        onClick={() => void save(null)}
      >
        {overridden
          ? isFilledEveryMonth(entry)
            ? "Reset to the usual amount"
            : `Remove from ${MONTHS_LONG[month - 1]}`
          : isFilledEveryMonth(entry)
            ? `Usual amount · ${kr(amount)}`
            : "One-time · not set this month"}
      </Button>
    </form>
  )
}
