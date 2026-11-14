"use client"

import { useMemo, useState } from "react"
import { Loader2 } from "lucide-react"

import { useBankSessions, useRawTransactions } from "@/lib/bank"
import {
  type AccountCompare,
  type CompareRow,
  compareBankToCsv,
} from "@/lib/bank-compare"
import { useTransactions } from "@/lib/data/use-budget"
import type { Transaction } from "@/lib/types"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
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

type View =
  | "none-in-range"
  | "close"
  | "ambiguous"
  | "csv-only"
  | "exact"
  | "before"
  | "after"

/**
 * Read-only: how the staged bank rows line up with the transactions already
 * imported from CSV. Matching = same amount (to the øre) and a date within
 * 4 days. Nothing is imported or changed.
 */
export function BankCompare() {
  const { data: raws } = useRawTransactions()
  const { transactions, isLoading } = useTransactions()
  const { data: sessions } = useBankSessions()

  const names = useMemo(() => {
    const m = new Map<string, string>()
    for (const s of sessions ?? []) {
      for (const a of s.accounts) {
        const key = a.account_id?.iban || a.identification_hash || a.uid
        if (key) m.set(key, a.name || a.product || key)
      }
    }
    return m
  }, [sessions])

  const result = useMemo(
    () => (raws && !isLoading ? compareBankToCsv(raws, transactions) : null),
    [raws, transactions, isLoading],
  )

  if (!result)
    return <Loader2 className="text-muted-foreground size-5 animate-spin" />
  if (!result.accounts.length) {
    return (
      <p className="text-muted-foreground text-sm">
        No bank data to compare yet.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-8">
      <p className="text-muted-foreground text-sm">
        Your CSV transactions cover{" "}
        <span className="text-foreground font-medium">
          {result.csvRange
            ? `${result.csvRange[0]} → ${result.csvRange[1]}`
            : "nothing yet"}
        </span>
        . A bank row &quot;matches&quot; a CSV row when the amount is identical
        and a date is within 4 days. Each CSV row can only match once.
      </p>
      {result.accounts.map((a) => (
        <AccountBlock
          key={a.accountKey}
          a={a}
          name={names.get(a.accountKey) ?? a.accountKey}
        />
      ))}
    </div>
  )
}

function AccountBlock({ a, name }: { a: AccountCompare; name: string }) {
  const [view, setView] = useState<View | null>(null)

  const groups = useMemo(() => {
    const g: Record<View, CompareRow[]> = {
      exact: [],
      close: [],
      ambiguous: [],
      "none-in-range": [],
      before: [],
      after: [],
      "csv-only": [],
    }
    for (const r of a.rows) {
      if (r.kind === "exact") g.exact.push(r)
      if (r.kind === "close") g.close.push(r)
      if (r.kind !== "none" && r.candidates > 1) g.ambiguous.push(r)
      if (r.kind === "none") {
        if (r.where === "in-csv-range") g["none-in-range"].push(r)
        else if (r.where === "before-csv") g.before.push(r)
        else g.after.push(r)
      }
    }
    return g
  }, [a])

  const tiles: {
    v: View
    label: string
    hint: string
    n: number
    tone: "ok" | "warn" | "info"
  }[] = [
    {
      v: "exact",
      label: "Exact match",
      hint: "Same amount, same date",
      n: groups.exact.length,
      tone: "ok",
    },
    {
      v: "close",
      label: "Close match",
      hint: "Same amount, date 1–4 days off",
      n: groups.close.length,
      tone: "info",
    },
    {
      v: "ambiguous",
      label: "Ambiguous",
      hint: "More than one CSV row could match",
      n: groups.ambiguous.length,
      tone: "warn",
    },
    {
      v: "none-in-range",
      label: "Bank only, inside CSV period",
      hint: "Not found in CSV although the CSV covers that date",
      n: groups["none-in-range"].length,
      tone: "warn",
    },
    {
      v: "csv-only",
      label: "CSV only",
      hint: "In CSV for this account, not in bank data (same period)",
      n: a.csvOnly.length,
      tone: "warn",
    },
    {
      v: "before",
      label: "Older than CSV",
      hint: "Extra history the CSV doesn't have",
      n: groups.before.length,
      tone: "info",
    },
    {
      v: "after",
      label: "Newer than CSV",
      hint: "New since your last CSV import",
      n: groups.after.length,
      tone: "info",
    },
  ]

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline gap-x-3">
        <h3 className="font-semibold">{name}</h3>
        <span className="text-muted-foreground text-xs">
          {a.rows.length} bank rows
          {a.bankRange && ` · ${a.bankRange[0]} → ${a.bankRange[1]}`}
          {a.superseded.length > 0 &&
            ` · ${a.superseded.length} older versions (not compared)`}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7">
        {tiles.map((t) => (
          <button
            key={t.v}
            type="button"
            onClick={() => setView(view === t.v ? null : t.v)}
            title={t.hint}
            className={cn(
              "border p-2 text-left transition-colors",
              view === t.v ? "border-primary bg-primary/5" : "hover:bg-muted",
            )}
          >
            <div
              className={cn(
                "text-xl font-semibold tabular-nums",
                t.tone === "warn" && t.n > 0 && "text-amber-600",
                t.tone === "ok" && "text-emerald-600",
              )}
            >
              {t.n}
            </div>
            <div className="text-[11px] leading-tight">{t.label}</div>
          </button>
        ))}
      </div>
      {view === "csv-only" ? (
        <CsvOnlyTable rows={a.csvOnly} />
      ) : view ? (
        <PairTable rows={groups[view]} />
      ) : null}
    </div>
  )
}

function PairTable({ rows }: { rows: CompareRow[] }) {
  const [shown, setShown] = useState(100)
  if (!rows.length)
    return <p className="text-muted-foreground text-sm">None.</p>
  return (
    <div className="flex flex-col gap-2">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Bank date</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead>Bank text</TableHead>
            <TableHead>CSV date</TableHead>
            <TableHead>CSV text</TableHead>
            <TableHead className="text-right">Δ days</TableHead>
            <TableHead className="text-right">Cands</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.slice(0, shown).map((r) => (
            <TableRow key={r.bank.raw.id} className="align-top text-xs">
              <TableCell className="whitespace-nowrap">{r.bank.date}</TableCell>
              <TableCell>{r.bank.status}</TableCell>
              <TableCell
                className={cn(
                  "text-right whitespace-nowrap tabular-nums",
                  (r.bank.cents ?? 0) < 0 && "text-destructive",
                )}
              >
                {r.bank.cents === null ? "?" : nok(r.bank.cents / 100)}
              </TableCell>
              <TableCell className="max-w-72 truncate" title={r.bank.text}>
                {r.bank.text || "—"}
              </TableCell>
              <TableCell className="whitespace-nowrap">
                {r.match ? (
                  <>
                    {r.match.booked_date}
                    {r.match.tx_date &&
                      r.match.tx_date !== r.match.booked_date && (
                        <span className="text-muted-foreground">
                          {" "}
                          (kjøp {r.match.tx_date})
                        </span>
                      )}
                  </>
                ) : (
                  "—"
                )}
              </TableCell>
              <TableCell className="max-w-72 truncate" title={csvText(r.match)}>
                {r.match ? csvText(r.match) : "—"}
                {r.match && !r.accountMatch && (
                  <Badge variant="outline" className="ml-1">
                    other/unknown account
                  </Badge>
                )}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {r.dayDiff ?? "—"}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {r.candidates}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {shown < rows.length && (
        <Button
          variant="outline"
          size="sm"
          className="self-center"
          onClick={() => setShown(shown + 100)}
        >
          Show more ({rows.length - shown} left)
        </Button>
      )}
    </div>
  )
}

function CsvOnlyTable({ rows }: { rows: Transaction[] }) {
  if (!rows.length)
    return <p className="text-muted-foreground text-sm">None.</p>
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Booked</TableHead>
          <TableHead>Purchase</TableHead>
          <TableHead>Pending?</TableHead>
          <TableHead className="text-right">Amount</TableHead>
          <TableHead>Text</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.slice(0, 300).map((t) => (
          <TableRow key={t.id} className="text-xs">
            <TableCell className="whitespace-nowrap">{t.booked_date}</TableCell>
            <TableCell className="whitespace-nowrap">
              {t.tx_date ?? "—"}
            </TableCell>
            <TableCell>{t.is_booked ? "" : "pending"}</TableCell>
            <TableCell
              className={cn(
                "text-right tabular-nums",
                Number(t.amount) < 0 && "text-destructive",
              )}
            >
              {nok(Number(t.amount))}
            </TableCell>
            <TableCell className="max-w-96 truncate">{csvText(t)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function csvText(t: Transaction | null): string {
  if (!t) return ""
  return [t.type, t.description, t.message].filter(Boolean).join(" · ")
}
