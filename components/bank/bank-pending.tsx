"use client"

import { useMemo } from "react"
import { Clock } from "lucide-react"
import useSWR from "swr"

import { fetchStaged, pendingBankTransactions } from "@/lib/bank-import"
import { useTransactions } from "@/lib/data/use-budget"
import { formatNOK } from "@/lib/format"
import { cn } from "@/lib/utils"

/**
 * Purchases the bank has reserved but not booked yet. Shown only — never
 * stored or counted in totals. They disappear when the bank books them (the
 * booked version is then added to the list) or cancels them.
 */
export function BankPending() {
  const { data: staged } = useSWR("bank_staged", fetchStaged, {
    revalidateOnFocus: false,
  })
  const { transactions, isLoading } = useTransactions()
  const pending = useMemo(
    () =>
      staged && !isLoading ? pendingBankTransactions(staged, transactions) : [],
    [staged, transactions, isLoading],
  )

  if (!pending.length) return null

  return (
    <section className="border border-dashed p-3">
      <div className="mb-2 flex flex-wrap items-baseline gap-x-2">
        <h2 className="flex items-center gap-1.5 text-xs font-semibold tracking-wider uppercase">
          <Clock className="size-3.5" />
          Pending at the bank ({pending.length})
        </h2>
        <span className="text-muted-foreground text-xs">
          Reserved, not booked yet — not counted in totals. Added to the list
          when the bank books them.
        </span>
      </div>
      <ul className="text-sm">
        {pending.map((p) => (
          <li key={p.key} className="flex gap-3 border-t py-1.5">
            <span className="text-muted-foreground w-24 shrink-0 tabular-nums">
              {p.date}
            </span>
            <span className="min-w-0 flex-1 truncate">{p.text || "—"}</span>
            <span
              className={cn(
                "shrink-0 tabular-nums",
                p.cents < 0 && "text-destructive",
              )}
            >
              {p.currency === "NOK"
                ? formatNOK(p.cents / 100, true)
                : `${(p.cents / 100).toFixed(2)} ${p.currency}`}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
