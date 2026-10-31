"use client"

import { useState } from "react"

import type { BudgetContext } from "@/lib/budget"
import { effectiveAmount, hasOverride, MONTHS_LONG } from "@/lib/budget"
import { dayLabel } from "@/lib/format"
import {
  useAmounts,
  useBudgetContext,
  useCategories,
  useEntries,
  useSalaryProfile,
} from "@/lib/data/use-budget"
import type { Entry } from "@/lib/types"
import { cn } from "@/lib/utils"
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
import {
  AmountForm,
  EmptyBudget,
  Figure,
  groupEntries,
  kindOrder,
  WebsiteLink,
  type Group,
  type Kind,
} from "@/components/os/os-budget-parts"
import { YearBudget } from "@/components/os/os-budget-year"

type Line = { entry: Entry; amount: number }
type Section = Omit<Group, "entries"> & { lines: Line[]; total: number }

/** The budget template: what comes in, goes out and is set aside — per month or for the year. */
export function OsBudget() {
  const { year, period } = useOs()
  const { entries: bills, isLoading: lb } = useEntries("bill")
  const { entries: incomes, isLoading: li } = useEntries("income")
  const { amounts, isLoading: la } = useAmounts()
  const { profile } = useSalaryProfile()
  const { categories } = useCategories()
  const ctx = useBudgetContext(amounts, profile)

  if (lb || li || la) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-28" />
        <Skeleton className="h-48" />
        <Skeleton className="h-48" />
      </div>
    )
  }
  if (bills.length === 0 && incomes.length === 0) {
    return <EmptyBudget year={year} />
  }

  const groups = groupEntries(incomes, bills, categories)
  return period === "year" ? (
    <YearBudget groups={groups} ctx={ctx} />
  ) : (
    <MonthBudget groups={groups} ctx={ctx} />
  )
}

function MonthBudget({ groups, ctx }: { groups: Group[]; ctx: BudgetContext }) {
  const { year, month, stats } = useOs()
  const [editing, setEditing] = useState<Line | null>(null)

  const lines = (entries: Entry[]) =>
    entries
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

  const sections: Section[] = groups
    .map(({ entries, ...g }) => {
      const ls = lines(entries)
      return { ...g, lines: ls, total: ls.reduce((s, l) => s + l.amount, 0) }
    })
    .filter((s) => s.kind === "income" || s.lines.length > 0)
    .sort((a, b) => kindOrder(a.kind) - kindOrder(b.kind) || b.total - a.total)

  const sum = (kind: Kind) =>
    sections.filter((s) => s.kind === kind).reduce((s, x) => s + x.total, 0)
  const income = sum("income")
  const billsTotal = sum("bill")
  const savings = sum("savings")
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

        <WebsiteLink />
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

      <Sheet
        open={editing != null}
        onOpenChange={(open) => {
          if (!open) {
            setEditing(null)
          }
        }}
      >
        <SheetContent
          side="bottom"
          className="gap-0 pb-[env(safe-area-inset-bottom)]"
        >
          {editing && (
            <>
              <SheetHeader className="border-b p-5 pr-14">
                <SheetTitle className="truncate text-base">
                  {editing.entry.name}
                </SheetTitle>
                <SheetDescription>
                  {MONTHS_LONG[month - 1]} {year} · now {kr(editing.amount)}
                </SheetDescription>
              </SheetHeader>
              <div className="p-5">
                <AmountForm
                  key={editing.entry.id}
                  entry={editing.entry}
                  year={year}
                  month={month}
                  amount={editing.amount}
                  overridden={hasOverride(ctx.amounts, editing.entry.id, month)}
                  onDone={() => setEditing(null)}
                />
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}
