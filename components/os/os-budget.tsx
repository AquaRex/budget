"use client"

import { useState } from "react"
import Link from "next/link"
import { ArrowUpRight } from "lucide-react"
import { toast } from "sonner"

import type { Entry } from "@/lib/types"
import { effectiveAmount, hasOverride } from "@/lib/budget"
import { dayLabel } from "@/lib/format"
import {
  useAmounts,
  useBudgetContext,
  useCategories,
  useEntries,
  useSalaryProfile,
} from "@/lib/data/use-budget"
import { setAmount } from "@/lib/data/entries"
import { MONTHS_LONG } from "@/lib/budget"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { down, kr, signedKr, up } from "@/components/stats/display"
import { useOs } from "@/components/os/os-shell"

type Line = { entry: Entry; amount: number }
type Section = {
  key: string
  title: string
  lines: Line[]
  total: number
  kind: "income" | "bill" | "savings"
}

/** The focused month of the budget template: what comes in, goes out and is set aside. */
export function OsBudget() {
  const { year, month, stats } = useOs()
  const { entries: bills, isLoading: lb } = useEntries("bill")
  const { entries: incomes, isLoading: li } = useEntries("income")
  const { amounts, isLoading: la } = useAmounts()
  const { profile } = useSalaryProfile()
  const { categories } = useCategories()
  const ctx = useBudgetContext(amounts, profile)
  const [editing, setEditing] = useState<Line | null>(null)

  const catById = new Map(categories.map((c) => [c.id, c]))
  const lines = (entries: Entry[]) =>
    entries
      .filter((e) => e.is_active)
      .map((entry) => ({ entry, amount: effectiveAmount(entry, ctx, month) }))
      // Zeroed recurring/overridden entries stay listed (muted) so they can be restored;
      // one-time entries without a value this month are just not part of it.
      .filter(
        (l) =>
          l.amount !== 0 ||
          l.entry.is_recurring ||
          hasOverride(ctx.amounts, l.entry.id, month),
      )
      .sort((a, b) => a.entry.due_day - b.entry.due_day)

  const sections: Section[] = []
  const incomeLines = lines(incomes)
  sections.push({
    key: "income",
    title: "Income",
    lines: incomeLines,
    total: incomeLines.reduce((s, l) => s + l.amount, 0),
    kind: "income",
  })
  const byCategory = new Map<string, Line[]>()
  for (const l of lines(bills)) {
    const key = l.entry.category_id ?? "none"
    byCategory.set(key, [...(byCategory.get(key) ?? []), l])
  }
  for (const [key, ls] of byCategory) {
    const cat = catById.get(key)
    sections.push({
      key,
      title: cat?.name ?? "No group",
      lines: ls,
      total: ls.reduce((s, l) => s + l.amount, 0),
      kind: cat?.is_savings ? "savings" : "bill",
    })
  }
  sections.sort((a, b) => order(a) - order(b) || b.total - a.total)

  const income = sections
    .filter((s) => s.kind === "income")
    .reduce((s, x) => s + x.total, 0)
  const billsTotal = sections
    .filter((s) => s.kind === "bill")
    .reduce((s, x) => s + x.total, 0)
  const savings = sections
    .filter((s) => s.kind === "savings")
    .reduce((s, x) => s + x.total, 0)
  const left = income - billsTotal - savings

  // Still to come this month (current month only): due after the imported data.
  const isCurrent = stats.months[month - 1]?.status === "current"
  const through = stats.dataThrough
  const throughDay =
    through &&
    through.slice(0, 7) === `${year}-${String(month).padStart(2, "0")}`
      ? Number(through.slice(8, 10))
      : 0
  const upcoming = isCurrent
    ? sections
        .flatMap((s) => s.lines.map((l) => ({ ...l, kind: s.kind })))
        .filter((l) => l.amount !== 0 && l.entry.due_day > throughDay)
        .sort((a, b) => a.entry.due_day - b.entry.due_day)
    : []

  if (lb || li || la) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-28" />
        <Skeleton className="h-48" />
        <Skeleton className="h-48" />
      </div>
    )
  }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-3 min-[600px]:grid-cols-2">
      <div className="flex min-w-0 flex-col gap-3">
        <section className="bg-card ring-foreground/5 grid grid-cols-2 gap-x-4 gap-y-3 p-4 shadow-sm ring-1">
          <Figure label="Income" value={kr(income)} className={up} />
          <Figure label="Bills" value={kr(billsTotal)} />
          <Figure label="To savings" value={kr(savings)} />
          <Figure
            label="Left"
            value={signedKr(left)}
            className={left >= 0 ? up : down}
            big
          />
        </section>

        {upcoming.length > 0 && (
          <section className="bg-card ring-foreground/5 flex flex-col shadow-sm ring-1">
            <h2 className="text-muted-foreground px-4 pt-3 pb-1 text-[11px] font-semibold tracking-widest uppercase">
              Still to come
            </h2>
            <ul className="divide-y">
              {upcoming.map((l) => (
                <li
                  key={l.entry.id}
                  className="flex min-h-11 items-center gap-3 px-4 py-2 text-sm"
                >
                  <span className="bg-muted text-muted-foreground flex size-9 shrink-0 items-center justify-center text-xs font-semibold">
                    {l.entry.due_day}
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    {l.entry.name}
                  </span>
                  <span
                    className={cn(
                      "shrink-0 font-semibold tabular-nums",
                      l.kind === "income" && up,
                    )}
                  >
                    {l.kind === "income" ? "+" : "−"}
                    {kr(l.amount)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <Link
          href="/budget"
          className="text-muted-foreground flex min-h-11 items-center justify-center gap-2 text-xs"
        >
          <ArrowUpRight className="size-4" aria-hidden /> Edit the whole year on
          the website
        </Link>
      </div>

      <div className="flex min-w-0 flex-col gap-3">
        {sections.map((s) => (
          <section
            key={s.key}
            className="bg-card ring-foreground/5 flex flex-col shadow-sm ring-1"
          >
            <h2 className="flex items-baseline justify-between gap-3 px-4 pt-3 pb-1">
              <span className="text-muted-foreground truncate text-[11px] font-semibold tracking-widest uppercase">
                {s.title}
                {s.kind === "savings" && " · set aside"}
              </span>
              <span
                className={cn(
                  "shrink-0 text-sm font-semibold tabular-nums",
                  s.kind === "income" && up,
                )}
              >
                {kr(s.total)}
              </span>
            </h2>
            {s.lines.length === 0 ? (
              <p className="text-muted-foreground px-4 pb-3 text-xs">
                Nothing budgeted.
              </p>
            ) : (
              <ul className="divide-y">
                {s.lines.map((l) => (
                  <li key={l.entry.id}>
                    <button
                      type="button"
                      onClick={() => setEditing(l)}
                      className={cn(
                        "active:bg-muted flex min-h-12 w-full items-center gap-3 px-4 py-2 text-left text-sm",
                        l.amount === 0 && "text-muted-foreground",
                      )}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{l.entry.name}</span>
                        <span className="text-muted-foreground text-xs">
                          due the {dayLabel(l.entry.due_day)}
                          {hasOverride(ctx.amounts, l.entry.id, month) &&
                            " · this month only"}
                        </span>
                      </span>
                      <span className="shrink-0 tabular-nums">
                        {kr(l.amount)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>

      <AmountSheet
        line={editing}
        year={year}
        month={month}
        onClose={() => setEditing(null)}
      />
    </div>
  )
}

function order(s: Section) {
  return s.kind === "income" ? 0 : s.kind === "bill" ? 1 : 2
}

function Figure({
  label,
  value,
  className,
  big = false,
}: {
  label: string
  value: string
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
    </div>
  )
}

/** Override one month's amount (or clear the override back to the default). */
function AmountSheet({
  line,
  year,
  month,
  onClose,
}: {
  line: Line | null
  year: number
  month: number
  onClose: () => void
}) {
  const { mutate } = useAmounts()
  const [value, setValue] = useState("")
  const [saving, setSaving] = useState(false)

  async function save(amount: number | null) {
    if (!line) {
      return
    }
    setSaving(true)
    try {
      await setAmount(line.entry.id, year, month, amount)
      await mutate()
      toast.success("Budget updated")
      onClose()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save.")
    } finally {
      setSaving(false)
    }
  }

  const parsed = Number(value.replace(/\s/g, "").replace(",", "."))
  const valid = value.trim() !== "" && Number.isFinite(parsed) && parsed >= 0

  return (
    <Sheet
      open={line != null}
      onOpenChange={(open) => {
        if (open) {
          return
        }
        setValue("")
        onClose()
      }}
    >
      <SheetContent
        side="bottom"
        className="gap-0 pb-[env(safe-area-inset-bottom)]"
      >
        {line && (
          <>
            <SheetHeader className="border-b p-5 pr-14">
              <SheetTitle className="truncate text-base">
                {line.entry.name}
              </SheetTitle>
              <SheetDescription>
                {MONTHS_LONG[month - 1]} {year} · now {kr(line.amount)}
              </SheetDescription>
            </SheetHeader>
            <form
              className="flex flex-col gap-3 p-5"
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
                placeholder={String(Math.round(line.amount))}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className="h-12 text-lg tabular-nums"
                aria-label={`Amount for ${MONTHS_LONG[month - 1]}`}
              />
              <Button type="submit" size="lg" disabled={!valid || saving}>
                Save for {MONTHS_LONG[month - 1]}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="lg"
                disabled={saving}
                onClick={() => void save(null)}
              >
                Reset to the usual amount
              </Button>
            </form>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
