"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { ArrowUpRight, Search, Upload, X } from "lucide-react"
import { toast } from "sonner"

import {
  buildGroupIndex,
  classifyTransactions,
  type ClassifiedTx,
} from "@/lib/stats/flows"
import { useStatsData } from "@/lib/stats/use-dashboard-stats"
import { useTransactions } from "@/lib/data/use-budget"
import { setTransactionCategory } from "@/lib/data/transactions"
import { deriveStem } from "@/lib/spending"
import { cn } from "@/lib/utils"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  flowLabel,
  formatLongDate,
  kr,
  periodKey,
  signedKr,
  up,
} from "@/components/stats/display"
import { useOs } from "@/components/os/os-shell"

const NONE = "__none__"
const dayHeading = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
})

function amountTone(f: ClassifiedTx) {
  if (!f.counted) {
    return "text-muted-foreground"
  }
  return f.flow === "income" || f.flow === "refund" ? up : "text-foreground"
}

/** The month's transactions, newest first, grouped by day and searchable. */
export function OsSpending() {
  const { year, month } = useOs()
  const { data, loading } = useStatsData()
  const [query, setQuery] = useState("")
  const [selected, setSelected] = useState<ClassifiedTx | null>(null)
  const period = periodKey(year, month)

  const index = useMemo(
    () =>
      buildGroupIndex(
        data.categories,
        data.labels,
        data.typeMap,
        data.bills,
        data.incomes,
      ),
    [data.categories, data.labels, data.typeMap, data.bills, data.incomes],
  )
  const rows = useMemo(
    () =>
      classifyTransactions(data.transactions, index)
        .filter((f) => f.date.slice(0, 7) === period)
        .sort((a, b) =>
          (b.tx.tx_at ?? b.date).localeCompare(a.tx.tx_at ?? a.date),
        ),
    [data.transactions, index, period],
  )
  const q = query.trim().toLowerCase()
  const shown = q
    ? rows.filter((f) =>
        [
          f.merchant,
          f.tx.description,
          f.tx.type,
          index.nameOf(f.groupId),
          String(Math.abs(Number(f.tx.amount))),
        ]
          .join(" ")
          .toLowerCase()
          .includes(q),
      )
    : rows
  const days: { date: string; rows: ClassifiedTx[] }[] = []
  for (const f of shown) {
    const last = days[days.length - 1]
    if (last?.date === f.date) {
      last.rows.push(f)
    } else {
      days.push({ date: f.date, rows: [f] })
    }
  }
  const spent = shown.reduce((s, f) => s + f.spent, 0)
  const income = shown.reduce((s, f) => s + f.income, 0)

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="bg-background sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-10 -mx-3 flex flex-col gap-2 px-3 pt-1 pb-2 min-[600px]:-mx-4 min-[600px]:px-4">
        <label className="bg-muted flex h-11 items-center gap-2 px-3">
          <Search
            className="text-muted-foreground size-4 shrink-0"
            aria-hidden
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search merchant, text or amount"
            className="h-11 min-w-0 flex-1 bg-transparent text-base outline-none select-text placeholder:text-sm"
            enterKeyHint="search"
          />
          {query && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => setQuery("")}
              className="text-muted-foreground flex size-8 items-center justify-center"
            >
              <X className="size-4" />
            </button>
          )}
        </label>
        <p className="text-muted-foreground text-xs tabular-nums">
          {shown.length} transactions · out {kr(spent)} · in {kr(income)}
        </p>
      </div>

      {loading ? (
        <div className="flex flex-col gap-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-14" />
          ))}
        </div>
      ) : days.length === 0 ? (
        <p className="text-muted-foreground py-16 text-center text-sm">
          {q
            ? "Nothing matches your search."
            : "No transactions this month yet."}
        </p>
      ) : (
        days.map((d) => {
          const daySpent = d.rows.reduce((s, f) => s + f.spent, 0)
          return (
            <section key={d.date} className="flex min-w-0 flex-col">
              <h2 className="text-muted-foreground flex justify-between px-1 pb-1 text-[11px] font-semibold tracking-widest uppercase">
                <span>{dayHeading.format(new Date(`${d.date}T00:00`))}</span>
                {daySpent !== 0 && (
                  <span className="tabular-nums">{kr(daySpent)}</span>
                )}
              </h2>
              <ul className="bg-card ring-foreground/5 divide-y shadow-sm ring-1">
                {d.rows.map((f) => {
                  const tag = flowLabel(f)
                  return (
                    <li key={f.tx.id}>
                      <button
                        type="button"
                        onClick={() => setSelected(f)}
                        className={cn(
                          "active:bg-muted flex min-h-14 w-full items-center gap-3 px-3 py-2 text-left",
                          !f.counted && "opacity-60",
                        )}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium capitalize">
                            {f.merchant}
                          </p>
                          <p className="text-muted-foreground truncate text-xs">
                            {[
                              tag,
                              index.nameOf(f.groupId),
                              f.tx.tx_at?.slice(11, 16),
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                        </div>
                        <span
                          className={cn(
                            "shrink-0 text-sm font-semibold tabular-nums",
                            amountTone(f),
                          )}
                        >
                          {signedKr(Number(f.tx.amount))}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </section>
          )
        })
      )}

      <Link
        href="/spending"
        className="text-muted-foreground flex min-h-11 items-center justify-center gap-2 text-xs"
      >
        <Upload className="size-4" aria-hidden /> Import a bank CSV on the
        website
      </Link>

      <TxSheet
        row={selected}
        groupName={selected ? index.nameOf(selected.groupId) : ""}
        categories={data.categories}
        period={period}
        onClose={() => setSelected(null)}
      />
    </div>
  )
}

function TxSheet({
  row,
  groupName,
  categories,
  period,
  onClose,
}: {
  row: ClassifiedTx | null
  groupName: string
  categories: { id: string; name: string }[]
  period: string
  onClose: () => void
}) {
  const { mutate } = useTransactions()
  const tx = row?.tx
  const sorted = [...categories].sort((a, b) => a.name.localeCompare(b.name))

  async function changeCategory(value: string) {
    if (!tx) {
      return
    }
    try {
      await setTransactionCategory(tx.id, value === NONE ? null : value)
      await mutate()
      toast.success("Category updated")
      onClose()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update category.")
    }
  }

  return (
    <Sheet
      open={row != null}
      onOpenChange={(open) => {
        if (!open) {
          onClose()
        }
      }}
    >
      <SheetContent
        side="bottom"
        className="max-h-[85dvh] gap-0 pb-[env(safe-area-inset-bottom)]"
      >
        {row && tx && (
          <>
            <SheetHeader className="border-b p-5 pr-14">
              <SheetTitle className="truncate text-base capitalize">
                {row.merchant}
              </SheetTitle>
              <SheetDescription
                className={cn(
                  "text-2xl font-semibold tabular-nums",
                  amountTone(row),
                )}
              >
                {signedKr(Number(tx.amount))}
              </SheetDescription>
            </SheetHeader>
            <div className="flex flex-col gap-4 overflow-y-auto overscroll-contain p-5">
              <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
                <dt className="text-muted-foreground">Date</dt>
                <dd>
                  {formatLongDate(row.date)}
                  {tx.tx_at && ` · ${tx.tx_at.slice(11, 16)}`}
                </dd>
                <dt className="text-muted-foreground">Counts as</dt>
                <dd>{flowLabel(row) ?? "Spending"}</dd>
                <dt className="text-muted-foreground">Group</dt>
                <dd className="truncate">{groupName}</dd>
                {tx.type && (
                  <>
                    <dt className="text-muted-foreground">Type</dt>
                    <dd className="truncate">{tx.type}</dd>
                  </>
                )}
                <dt className="text-muted-foreground">Text</dt>
                <dd className="break-all select-text">
                  {tx.description || "—"}
                </dd>
              </dl>
              <label className="flex flex-col gap-1.5">
                <span className="text-muted-foreground text-[11px] font-semibold tracking-widest uppercase">
                  Category
                </span>
                <Select
                  value={tx.category_id ?? NONE}
                  onValueChange={(v) => void changeCategory(v)}
                >
                  <SelectTrigger className="h-11 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>
                      No category (use bank type)
                    </SelectItem>
                    {sorted.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              <Link
                href={`/spending?tab=transactions&period=${period}&q=${encodeURIComponent(deriveStem(tx.description) || tx.type || "")}`}
                className="text-muted-foreground flex min-h-11 items-center gap-2 text-sm"
              >
                <ArrowUpRight className="size-4" aria-hidden /> Open on the
                website
              </Link>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
