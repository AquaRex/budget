"use client"

import { useMemo, useState } from "react"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import useSWR from "swr"

import {
  addHeld,
  fetchStaged,
  historyIssues,
  planBankImport,
} from "@/lib/bank-import"
import { bankText } from "@/lib/reconcile"
import { useStoredTransactions as useTransactions } from "@/lib/data/use-budget"
import { errMessage } from "@/lib/errors"
import type { Transaction } from "@/lib/types"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

const nok = (n: number) =>
  n.toLocaleString("nb-NO", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })

const txText = (t: Transaction) =>
  [t.description, t.message].filter(Boolean).join(" · ") || t.type || "—"

function useBankPlan() {
  const { data: staged, error } = useSWR("bank_staged", fetchStaged, {
    revalidateOnFocus: false,
  })
  const { transactions, isLoading } = useTransactions()
  const plan = useMemo(
    () => (staged && !isLoading ? planBankImport(staged, transactions) : null),
    [staged, transactions, isLoading],
  )
  return { plan, staged, error }
}

/** Bank transactions not added automatically because a look-alike is nearby. */
export function BankHeld() {
  const { plan, error } = useBankPlan()
  const [busy, setBusy] = useState(false)
  if (error) {
    return (
      <p className="text-destructive text-sm">
        {errMessage(error, "Could not load.")}
      </p>
    )
  }
  if (!plan)
    return <Loader2 className="text-muted-foreground size-5 animate-spin" />
  if (!plan.held.length) {
    return (
      <p className="text-muted-foreground text-sm">
        Nothing waiting — every bank transaction is either in your list or was
        added automatically.
      </p>
    )
  }

  async function add(i: number | "all") {
    if (!plan) return
    setBusy(true)
    try {
      const items =
        i === "all" ? plan.held.map((h) => h.incoming) : [plan.held[i].incoming]
      const n = await addHeld(items)
      toast.success(`Added ${n} transaction${n === 1 ? "" : "s"}.`)
    } catch (e) {
      toast.error(errMessage(e, "Could not add."))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Bank date</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead>Bank text</TableHead>
            <TableHead>Already in your list nearby</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {plan.held.map((h, i) => (
            <TableRow
              key={`${h.incoming.stagedId}-${h.incoming.occurrence}`}
              className="align-top text-xs"
            >
              <TableCell className="whitespace-nowrap">
                {h.incoming.date}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {nok(h.incoming.cents / 100)}
              </TableCell>
              <TableCell>{bankText(h.incoming.raw) || "—"}</TableCell>
              <TableCell>
                {h.near.map((n) => (
                  <div key={n.tx.id}>
                    {n.tx.booked_date} · {txText(n.tx)}
                  </div>
                ))}
              </TableCell>
              <TableCell>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => add(i)}
                >
                  Add
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <p className="text-muted-foreground text-xs">
        Only add one if it really is a separate transaction. If it&apos;s the
        same one as the row next to it, leave it — it stays listed here and
        never gets added on its own.
      </p>
    </div>
  )
}

/**
 * The history check — INFORMATION ONLY. Lists rows in your list that the bank
 * has no record of (inside the period and accounts the bank covers). That does
 * not make them wrong: it can't remove or change anything.
 */
export function BankHistoryCheck() {
  const { plan, staged, error } = useBankPlan()
  const [open, setOpen] = useState(false)

  const issues = useMemo(
    () => (plan && staged ? historyIssues(plan, staged) : null),
    [plan, staged],
  )

  if (error) {
    return (
      <p className="text-destructive text-sm">
        {errMessage(error, "Could not load.")}
      </p>
    )
  }
  if (!issues) {
    return <Loader2 className="text-muted-foreground size-5 animate-spin" />
  }
  if (!issues.length) {
    return (
      <p className="text-muted-foreground text-sm">
        No differences: everything in your list for the accounts and period the
        bank covers is also in the bank&apos;s records.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm">
        <span className="font-semibold">{issues.length}</span> row(s) in your
        list are not in the bank&apos;s records for the same account and amount
        within a few days. Often an early version of a transfer or payment that
        the bank later re-dated (its confirmed version is shown next to it).
        This is for your information only — nothing here is changed or removed.
      </p>
      <div>
        <Button variant="outline" size="sm" onClick={() => setOpen(!open)}>
          {open ? "Hide" : "Show"} the {issues.length} row(s)
        </Button>
      </div>
      {open && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>In your list</TableHead>
              <TableHead>
                Bank-confirmed nearby (same account + amount)
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {issues.map(({ tx, confirmedNearby }) => (
              <TableRow key={tx.id} className="align-top text-xs">
                <TableCell className="whitespace-nowrap">
                  {tx.booked_date}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {nok(Number(tx.amount))}
                </TableCell>
                <TableCell>
                  {txText(tx)}
                  {!tx.is_booked && (
                    <span className="text-muted-foreground"> (pending)</span>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {confirmedNearby.length
                    ? confirmedNearby.map((c) => (
                        <div key={c.id}>
                          {c.booked_date} · {txText(c)}
                        </div>
                      ))
                    : "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
