"use client"

import { Wand2 } from "lucide-react"

import type { Transaction } from "@/lib/types"
import { formatNOK } from "@/lib/format"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

/** Everything the bank's CSV gave for one transaction — what rules can match on. */
export function TxDetailsDialog({
  tx,
  onClose,
  onMakeRule,
}: {
  tx: Transaction | null
  onClose: () => void
  onMakeRule: (tx: Transaction) => void
}) {
  const rows: [string, string | null][] = tx
    ? [
        ["Booked", tx.booked_date],
        ["Paid", tx.tx_date],
        ["Type", tx.type],
        ["Description", tx.description],
        ["Message", tx.message],
        ["Amount", formatNOK(Number(tx.amount), true)],
        ["Currency", tx.currency],
        ["From account", tx.from_account],
        ["To account", tx.to_account],
      ]
    : []
  return (
    <Dialog open={!!tx} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Transaction details</DialogTitle>
          <DialogDescription>
            What the bank gave for this transaction. Rules can match on any of
            it.
          </DialogDescription>
        </DialogHeader>
        <dl className="grid grid-cols-[7rem_minmax(0,1fr)] border text-sm">
          {rows.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-muted-foreground border-b px-2.5 py-1.5 text-xs">
                {label}
              </dt>
              <dd className="border-b px-2.5 py-1.5 font-mono text-xs break-words whitespace-pre-wrap">
                {value || <span className="text-muted-foreground">—</span>}
              </dd>
            </div>
          ))}
        </dl>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button
            onClick={() => {
              if (tx) {
                onMakeRule(tx)
              }
              onClose()
            }}
          >
            <Wand2 className="size-4" />
            Make a rule…
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
