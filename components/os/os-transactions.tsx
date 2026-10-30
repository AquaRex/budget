"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { ArrowUpRight, Check, Search, Upload, X } from "lucide-react"
import { toast } from "sonner"

import {
  buildGroupIndex,
  classifyTransactions,
  type ClassifiedTx,
} from "@/lib/stats/flows"
import { useStatsData } from "@/lib/stats/use-dashboard-stats"
import { useTransactions, useTxRules } from "@/lib/data/use-budget"
import {
  categorizeBySource,
  setTransactionCategory,
} from "@/lib/data/transactions"
import {
  deriveStem,
  effectiveCategoryId,
  sourceKeyFor,
  txMatchesSource,
} from "@/lib/spending"
import type { Category, Transaction } from "@/lib/types"
import { cn } from "@/lib/utils"
import { Skeleton } from "@/components/ui/skeleton"
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
export function OsTransactions() {
  const { year, month } = useOs()
  const { data, loading } = useStatsData()
  const [query, setQuery] = useState("")
  const [selected, setSelected] = useState<ClassifiedTx | null>(null)
  const period = periodKey(year, month)

  const index = useMemo(
    () =>
      buildGroupIndex(data.categories, data.typeMap, data.bills, data.incomes),
    [data.categories, data.typeMap, data.bills, data.incomes],
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
  const names = useMemo(
    () => new Map([...data.categories, ...data.labels].map((c) => [c.id, c.name])),
    [data.categories, data.labels],
  )
  const q = query.trim().toLowerCase()
  const shown = q
    ? rows.filter((f) =>
        [
          f.merchant,
          f.tx.description,
          f.tx.type,
          f.tx.message,
          index.nameOf(f.groupId),
          names.get(effectiveCategoryId(f.tx, data.typeMap) ?? ""),
          names.get(f.tx.label_id ?? ""),
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
            placeholder="Search merchant, tag, category or amount"
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
        href="/transactions"
        className="text-muted-foreground flex min-h-11 items-center justify-center gap-2 text-xs"
      >
        <Upload className="size-4" aria-hidden /> Import a bank CSV on the
        website
      </Link>

      <TxSheet
        row={selected}
        groupName={selected ? index.nameOf(selected.groupId) : ""}
        categories={data.categories}
        transactions={data.transactions}
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
  transactions,
  period,
  onClose,
}: {
  row: ClassifiedTx | null
  groupName: string
  categories: Category[]
  transactions: Transaction[]
  period: string
  onClose: () => void
}) {
  const { mutate } = useTransactions()
  const { mutate: mutateRules } = useTxRules()
  const [onlyThis, setOnlyThis] = useState(false)
  const [query, setQuery] = useState("")
  const [saving, setSaving] = useState(false)
  const tx = row?.tx
  const source = tx ? sourceKeyFor(tx) : null
  const sameSource = source
    ? transactions.filter((t) =>
        txMatchesSource(t, source.matchType, source.pattern),
      ).length
    : 1
  const wholeMerchant = !onlyThis && source != null && sameSource > 1

  // Groups in sort order, each with its categories; ungrouped ones last.
  const sections = useMemo(() => {
    const groups = categories
      .filter((c) => c.is_group)
      .sort((a, b) => a.sort_order - b.sort_order)
    const groupIds = new Set(groups.map((g) => g.id))
    const byName = (a: Category, b: Category) => a.name.localeCompare(b.name)
    const out = groups.map((g) => ({
      key: g.id,
      title: g.name,
      items: [
        g,
        ...categories
          .filter((c) => !c.is_group && c.group_id === g.id)
          .sort(byName),
      ],
    }))
    const loose = categories
      .filter((c) => !c.is_group && !(c.group_id && groupIds.has(c.group_id)))
      .sort(byName)
    if (loose.length) {
      out.push({ key: NONE, title: "Needs sorting", items: loose })
    }
    return out
  }, [categories])
  const q = query.trim().toLowerCase()
  const shownSections = sections
    .map((sec) => ({
      ...sec,
      items: q
        ? sec.items.filter((c) =>
            `${sec.title} ${c.name}`.toLowerCase().includes(q),
          )
        : sec.items,
    }))
    .filter((sec) => sec.items.length > 0)

  function reset() {
    setQuery("")
    setOnlyThis(false)
  }

  async function choose(categoryId: string | null) {
    if (!tx) {
      return
    }
    setSaving(true)
    try {
      if (wholeMerchant) {
        const n = await categorizeBySource(tx, categoryId)
        await Promise.all([mutate(), mutateRules()])
        toast.success(`Updated ${n} transactions from ${row?.merchant}`)
      } else {
        await setTransactionCategory(tx.id, categoryId)
        await mutate()
        toast.success("Category updated for this transaction")
      }
      reset()
      onClose()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update category.")
    } finally {
      setSaving(false)
    }
  }

  const option = (c: Category | null, label: string, group?: string) => {
    const id = c?.id ?? null
    const current = (tx?.category_id ?? null) === id
    return (
      <li key={id ?? "none"}>
        <button
          type="button"
          disabled={saving}
          onClick={() => void choose(id)}
          aria-pressed={current}
          className="active:bg-muted flex min-h-11 w-full items-center gap-2 px-3 text-left text-sm disabled:opacity-50"
        >
          <span className="min-w-0 flex-1 truncate">
            {group && <span className="text-muted-foreground">{group} › </span>}
            {label}
          </span>
          {current && (
            <Check className="text-primary size-4 shrink-0" aria-hidden />
          )}
        </button>
      </li>
    )
  }

  return (
    <Sheet
      open={row != null}
      onOpenChange={(open) => {
        if (!open) {
          reset()
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

              <section className="flex flex-col gap-2">
                <h3 className="text-muted-foreground text-[11px] font-semibold tracking-widest uppercase">
                  Category
                </h3>
                {wholeMerchant || onlyThis ? (
                  <div className="grid grid-cols-2 border">
                    {[
                      { only: false, label: `All ${sameSource}` },
                      { only: true, label: "Only this one" },
                    ].map((o) => (
                      <button
                        key={o.label}
                        type="button"
                        aria-pressed={onlyThis === o.only}
                        onClick={() => setOnlyThis(o.only)}
                        className={cn(
                          "h-11 text-xs font-semibold tracking-widest uppercase",
                          onlyThis === o.only
                            ? "bg-primary text-primary-foreground"
                            : "text-muted-foreground active:bg-muted",
                        )}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                ) : null}
                <p className="text-muted-foreground text-xs">
                  {wholeMerchant
                    ? `Applies to all ${sameSource} transactions from ${row.merchant}, past and future.`
                    : "Applies to this transaction only."}
                </p>
                {categories.length > 12 && (
                  <label className="bg-muted flex h-11 items-center gap-2 px-3">
                    <Search
                      className="text-muted-foreground size-4 shrink-0"
                      aria-hidden
                    />
                    <input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Find a category"
                      className="h-11 min-w-0 flex-1 bg-transparent text-base outline-none select-text placeholder:text-sm"
                    />
                  </label>
                )}
                <ul className="bg-card ring-foreground/5 divide-y ring-1">
                  {!q && option(null, "No category (use bank type)")}
                  {shownSections.map((sec) =>
                    sec.items.map((c) =>
                      option(
                        c,
                        c.name,
                        c.id === sec.key ? undefined : sec.title,
                      ),
                    ),
                  )}
                </ul>
                {q && shownSections.length === 0 && (
                  <p className="text-muted-foreground text-xs">
                    No category matches.
                  </p>
                )}
                <Link
                  href="/settings"
                  className="text-muted-foreground flex min-h-11 items-center gap-2 text-sm"
                >
                  <ArrowUpRight className="size-4" aria-hidden /> Manage
                  categories on the website
                </Link>
              </section>
              <Link
                href={`/transactions?tab=transactions&period=${period}&q=${encodeURIComponent(deriveStem(tx.description) || tx.type || "")}`}
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
