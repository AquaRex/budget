"use client"

import { useState } from "react"

import type { BudgetContext } from "@/lib/budget"
import {
  hasOverride,
  isFilledEveryMonth,
  MONTHS_LONG,
  MONTHS_SHORT,
  rowMonthlyAmounts,
  rowTotal,
} from "@/lib/budget"
import { dayLabel } from "@/lib/format"
import type { Entry } from "@/lib/types"
import { cn } from "@/lib/utils"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { compact, down, kr, signedKr, up } from "@/components/stats/display"
import { useOs } from "@/components/os/os-shell"
import {
  AmountForm,
  Figure,
  kindOrder,
  WebsiteLink,
  type Group,
  type Kind,
} from "@/components/os/os-budget-parts"

type Row = { entry: Entry; values: number[]; total: number }
type YearSection = Omit<Group, "entries"> & {
  rows: Row[]
  monthly: number[]
  total: number
}

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1)

/** The whole year's budget: totals, month by month, and every line's 12 months. */
export function YearBudget({
  groups,
  ctx,
}: {
  groups: Group[]
  ctx: BudgetContext
}) {
  const { year, openMonth } = useOs()
  const [selected, setSelected] = useState<Entry | null>(null)
  const now = new Date()
  const currentMonth = now.getFullYear() === year ? now.getMonth() + 1 : null

  const sections: YearSection[] = groups
    .map(({ entries, ...g }) => {
      const rows = entries
        .map((entry) => {
          const values = rowMonthlyAmounts(entry, ctx)
          return { entry, values, total: rowTotal(values) }
        })
        .filter(
          (r) =>
            r.total !== 0 ||
            r.entry.is_recurring ||
            MONTHS.some((m) => hasOverride(ctx.amounts, r.entry.id, m)),
        )
        .sort((a, b) => b.total - a.total)
      const monthly = MONTHS.map((m) =>
        rows.reduce((s, r) => s + r.values[m - 1], 0),
      )
      return { ...g, rows, monthly, total: rowTotal(monthly) }
    })
    .filter((s) => s.kind === "income" || s.rows.length > 0)
    .sort((a, b) => kindOrder(a.kind) - kindOrder(b.kind) || b.total - a.total)

  const monthlyOf = (kind: Kind) =>
    MONTHS.map((m) =>
      sections
        .filter((s) => s.kind === kind)
        .reduce((s, x) => s + x.monthly[m - 1], 0),
    )
  const incomeM = monthlyOf("income")
  const billsM = monthlyOf("bill")
  const savingsM = monthlyOf("savings")
  const leftM = MONTHS.map(
    (m) => incomeM[m - 1] - billsM[m - 1] - savingsM[m - 1],
  )
  const income = rowTotal(incomeM)
  const bills = rowTotal(billsM)
  const savings = rowTotal(savingsM)
  const left = rowTotal(leftM)
  const perMonth = (v: number) => `≈ ${kr(v / 12)} / month`

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-3 min-[600px]:grid-cols-2">
      <div className="flex min-w-0 flex-col gap-3">
        <section className="bg-card ring-foreground/5 grid grid-cols-2 gap-x-4 gap-y-3 p-4 shadow-sm ring-1">
          <Figure
            label="Income"
            value={kr(income)}
            sub={perMonth(income)}
            className={up}
          />
          <Figure label="Bills" value={kr(bills)} sub={perMonth(bills)} />
          <Figure
            label="Set aside"
            value={kr(savings)}
            sub={perMonth(savings)}
          />
          <Figure
            label="Left"
            value={signedKr(left)}
            sub={`≈ ${signedKr(left / 12)} / month`}
            className={left >= 0 ? up : down}
            big
          />
        </section>

        <section className="bg-card ring-foreground/5 flex flex-col shadow-sm ring-1">
          <h2 className="text-muted-foreground flex justify-between gap-3 px-4 pt-3 pb-2 text-[11px] font-semibold tracking-widest uppercase">
            <span>Left each month</span>
            <span className="font-normal normal-case tracking-normal">
              tap to open
            </span>
          </h2>
          <div className="grid grid-cols-6 gap-px border-t bg-border">
            {MONTHS.map((m) => {
              const v = leftM[m - 1]
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => openMonth(m)}
                  aria-label={`${MONTHS_LONG[m - 1]}: ${signedKr(v)} left`}
                  className={cn(
                    "bg-card active:bg-muted flex min-h-14 flex-col items-center justify-center gap-0.5 px-1",
                    m === currentMonth && "ring-primary ring-2 ring-inset",
                  )}
                >
                  <span className="text-muted-foreground text-[11px] font-semibold uppercase">
                    {MONTHS_SHORT[m - 1]}
                  </span>
                  <span
                    className={cn(
                      "text-xs font-semibold tabular-nums",
                      v < 0 ? down : v > 0 ? up : "text-muted-foreground",
                    )}
                  >
                    {v < 0 ? "−" : ""}
                    {compact(Math.abs(v))}
                  </span>
                </button>
              )
            })}
          </div>
        </section>

        <p className="text-muted-foreground flex items-center gap-3 px-1 text-xs">
          <span className="flex items-center gap-1.5">
            <span aria-hidden className="bg-foreground/30 size-2.5" /> usual
            amount
          </span>
          <span className="flex items-center gap-1.5">
            <span aria-hidden className="bg-primary size-2.5" /> set for that
            month
          </span>
        </p>

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
            {s.rows.length === 0 ? (
              <p className="text-muted-foreground px-4 pb-3 text-xs">
                Nothing budgeted.
              </p>
            ) : (
              <ul className="divide-y">
                {s.rows.map((r) => {
                  const count = r.values.filter((v) => v !== 0).length
                  return (
                    <li key={r.entry.id}>
                      <button
                        type="button"
                        onClick={() => setSelected(r.entry)}
                        className={cn(
                          "active:bg-muted flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left text-sm",
                          r.total === 0 && "text-muted-foreground",
                        )}
                      >
                        <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                          <span className="truncate">{r.entry.name}</span>
                          <MiniBars
                            values={r.values}
                            overrides={MONTHS.map((m) =>
                              hasOverride(ctx.amounts, r.entry.id, m),
                            )}
                            current={currentMonth}
                          />
                        </span>
                        <span className="flex shrink-0 flex-col items-end">
                          <span className="tabular-nums">{kr(r.total)}</span>
                          <span className="text-muted-foreground text-xs tabular-nums">
                            {count === 12
                              ? `≈ ${kr(r.total / 12)}/mo`
                              : `${count} of 12 months`}
                          </span>
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        ))}
      </div>

      <EntryYearSheet
        entry={selected}
        ctx={ctx}
        year={year}
        onClose={() => setSelected(null)}
      />
    </div>
  )
}

function MiniBars({
  values,
  overrides,
  current,
}: {
  values: number[]
  overrides: boolean[]
  current: number | null
}) {
  const max = Math.max(...values, 0)
  return (
    <span aria-hidden className="flex h-5 max-w-56 items-end gap-0.5">
      {values.map((v, i) => (
        <span
          key={i}
          className={cn(
            "flex-1",
            v === 0
              ? "bg-muted h-px"
              : overrides[i]
                ? "bg-primary"
                : "bg-foreground/30",
            i + 1 === current && v !== 0 && "outline-foreground/60 outline",
          )}
          style={
            v === 0 ? undefined : { height: `${Math.max((v / max) * 100, 12)}%` }
          }
        />
      ))}
    </span>
  )
}

/** All 12 months of one entry; tap a month to set or reset its amount. */
function EntryYearSheet({
  entry,
  ctx,
  year,
  onClose,
}: {
  entry: Entry | null
  ctx: BudgetContext
  year: number
  onClose: () => void
}) {
  const [editMonth, setEditMonth] = useState<number | null>(null)
  const values = entry ? rowMonthlyAmounts(entry, ctx) : []

  return (
    <Sheet
      open={entry != null}
      onOpenChange={(open) => {
        if (open) {
          return
        }
        setEditMonth(null)
        onClose()
      }}
    >
      <SheetContent
        side="bottom"
        className="max-h-[90dvh] gap-0 pb-[env(safe-area-inset-bottom)]"
      >
        {entry && (
          <>
            <SheetHeader className="border-b p-5 pr-14">
              <SheetTitle className="truncate text-base">{entry.name}</SheetTitle>
              <SheetDescription>
                {year} · {kr(rowTotal(values))} · due the{" "}
                {dayLabel(entry.due_day)}
              </SheetDescription>
            </SheetHeader>
            <ul className="divide-y overflow-y-auto overscroll-contain">
              {MONTHS.map((m) => {
                const v = values[m - 1]
                const overridden = hasOverride(ctx.amounts, entry.id, m)
                const open = editMonth === m
                return (
                  <li key={m} className={cn(open && "bg-muted/40")}>
                    <button
                      type="button"
                      aria-expanded={open}
                      onClick={() => setEditMonth(open ? null : m)}
                      className="active:bg-muted flex min-h-12 w-full items-center gap-3 px-5 py-2 text-left text-sm"
                    >
                      <span
                        aria-hidden
                        className={cn(
                          "size-2.5 shrink-0",
                          overridden ? "bg-primary" : "bg-foreground/30",
                          v === 0 && !overridden && "bg-muted",
                        )}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block">{MONTHS_LONG[m - 1]}</span>
                        <span className="text-muted-foreground text-xs">
                          {overridden
                            ? "set for this month"
                            : entry.is_salary
                              ? "from salary"
                              : isFilledEveryMonth(entry)
                                ? "usual amount"
                                : "not budgeted"}
                        </span>
                      </span>
                      <span
                        className={cn(
                          "shrink-0 tabular-nums",
                          v === 0 && "text-muted-foreground",
                          overridden && "font-semibold",
                        )}
                      >
                        {kr(v)}
                      </span>
                    </button>
                    {open && (
                      <div className="px-5 pb-4">
                        <AmountForm
                          key={`${entry.id}-${m}`}
                          entry={entry}
                          year={year}
                          month={m}
                          amount={v}
                          overridden={overridden}
                          onDone={() => setEditMonth(null)}
                        />
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
