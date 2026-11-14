"use client"

import { useState } from "react"
import { Loader2 } from "lucide-react"

import { type BankFetch, useBankFetches } from "@/lib/bank"
import { errMessage } from "@/lib/errors"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

const fmtTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("nb-NO") : "—"

/** Every pull from the bank: when, by whom (button / daily), and the result. */
export function BankFetchHistory() {
  const { data: fetches, error } = useBankFetches()
  if (error) {
    return (
      <p className="text-destructive text-sm">
        {errMessage(error, "Could not load.")}
      </p>
    )
  }
  if (!fetches) {
    return <Loader2 className="text-muted-foreground size-5 animate-spin" />
  }
  if (!fetches.length) {
    return <p className="text-muted-foreground text-sm">No updates yet.</p>
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Started</TableHead>
          <TableHead>How</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Accounts</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {fetches.slice(0, 20).map((f) => (
          <FetchRow key={f.id} f={f} />
        ))}
      </TableBody>
    </Table>
  )
}

function FetchRow({ f }: { f: BankFetch }) {
  const [open, setOpen] = useState(false)
  const accounts = f.summary.accounts ?? []
  const failed = accounts.filter((a) => a.error)
  return (
    <>
      <TableRow
        className="cursor-pointer align-top text-xs"
        onClick={() => setOpen(!open)}
      >
        <TableCell className="whitespace-nowrap">
          {fmtTime(f.started_at)}
        </TableCell>
        <TableCell>{f.trigger === "auto" ? "Daily" : "Button"}</TableCell>
        <TableCell>
          <Badge
            variant={
              f.status === "ok"
                ? "secondary"
                : f.status === "running"
                  ? "outline"
                  : "destructive"
            }
          >
            {f.status}
          </Badge>
        </TableCell>
        <TableCell>
          {accounts.length} account{accounts.length === 1 ? "" : "s"}
          {failed.length > 0 && (
            <span className="text-destructive"> · {failed.length} failed</span>
          )}
        </TableCell>
      </TableRow>
      {open && (
        <TableRow>
          <TableCell colSpan={4} className="text-xs">
            {f.error && <div className="text-destructive mb-1">{f.error}</div>}
            {accounts.map((a) => (
              <div key={a.account_key}>
                <span className="font-medium">
                  {a.product ?? a.cash_account_type ?? "Account"} …
                  {a.account_key.slice(-4)}
                </span>{" "}
                {a.error ? (
                  <span className="text-destructive">{a.error}</span>
                ) : (
                  <span className="text-muted-foreground tabular-nums">
                    {a.fetched ?? 0} received, {a.new ?? 0} new to the bank
                    archive
                  </span>
                )}
              </div>
            ))}
          </TableCell>
        </TableRow>
      )}
    </>
  )
}
