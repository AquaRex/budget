"use client"

import { Fragment, useMemo, useState } from "react"
import { Download, Loader2 } from "lucide-react"

import {
  type BankFetch,
  type RawTransaction,
  rawAmount,
  rawDate,
  rawText,
  useBankFetches,
  useBankSessions,
  useRawTransactions,
} from "@/lib/bank"
import { errMessage } from "@/lib/errors"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

const PAGE = 200

function fmtTime(iso: string | null) {
  return iso ? new Date(iso).toLocaleString("nb-NO") : "—"
}

/** Every "Update" click: when, result, and per-account counts. */
export function BankFetchHistory() {
  const { data: fetches, error } = useBankFetches()
  if (error)
    return (
      <p className="text-destructive text-sm">
        {errMessage(error, "Could not load.")}
      </p>
    )
  if (!fetches)
    return <Loader2 className="text-muted-foreground size-5 animate-spin" />
  if (!fetches.length) {
    return (
      <p className="text-muted-foreground text-sm">
        No updates yet. Use the Update button at the top.
      </p>
    )
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Started</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Accounts (fetched / new / already had)</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {fetches.map((f) => (
          <FetchRow key={f.id} f={f} />
        ))}
      </TableBody>
    </Table>
  )
}

function FetchRow({ f }: { f: BankFetch }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <TableRow
        className="cursor-pointer align-top"
        onClick={() => setOpen(!open)}
      >
        <TableCell className="whitespace-nowrap">
          {fmtTime(f.started_at)}
        </TableCell>
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
          {f.error && (
            <div className="text-destructive mt-1 text-xs">{f.error}</div>
          )}
        </TableCell>
        <TableCell className="text-xs">
          {(f.summary.accounts ?? []).map((a) => (
            <div key={a.account_key}>
              <span className="font-medium">{a.name ?? a.account_key}</span>{" "}
              {a.error ? (
                <span className="text-destructive">{a.error}</span>
              ) : (
                <span className="text-muted-foreground tabular-nums">
                  {a.fetched ?? 0} / {a.new ?? 0} / {a.known ?? 0} ·{" "}
                  {a.strategy}
                </span>
              )}
            </div>
          ))}
        </TableCell>
      </TableRow>
      {open && (
        <TableRow>
          <TableCell colSpan={3}>
            <pre className="bg-muted max-h-96 overflow-auto p-3 text-[11px] leading-snug">
              {JSON.stringify(f.summary, null, 2)}
            </pre>
          </TableCell>
        </TableRow>
      )}
    </>
  )
}

/** The raw staged transactions, exactly as the bank sent them. */
export function BankRawData() {
  const { data: rows, error } = useRawTransactions()
  const { data: sessions } = useBankSessions()
  const [account, setAccount] = useState<string>("all")
  const [shown, setShown] = useState(PAGE)
  const [openId, setOpenId] = useState<string | null>(null)

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

  const filtered = useMemo(() => {
    const list = (rows ?? []).filter(
      (r) => account === "all" || r.account_key === account,
    )
    return [...list].sort((a, b) =>
      rawDate(b.raw).localeCompare(rawDate(a.raw)),
    )
  }, [rows, account])

  const stats = useMemo(() => fieldStats(filtered), [filtered])

  if (error)
    return (
      <p className="text-destructive text-sm">
        {errMessage(error, "Could not load.")}
      </p>
    )
  if (!rows)
    return <Loader2 className="text-muted-foreground size-5 animate-spin" />
  if (!rows.length) {
    return <p className="text-muted-foreground text-sm">No raw data yet.</p>
  }

  const accounts = [...new Set(rows.map((r) => r.account_key))]

  function download() {
    const blob = new Blob([JSON.stringify(filtered, null, 2)], {
      type: "application/json",
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `bank-raw-${account === "all" ? "all" : (names.get(account) ?? "account")}-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={account}
          onValueChange={(v) => {
            setAccount(v)
            setShown(PAGE)
          }}
        >
          <SelectTrigger className="w-72">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All accounts ({rows.length})</SelectItem>
            {accounts.map((k) => (
              <SelectItem key={k} value={k}>
                {names.get(k) ?? k} (
                {rows.filter((r) => r.account_key === k).length})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={download}>
          <Download className="size-4" />
          Download JSON
        </Button>
      </div>

      <div className="grid gap-4 text-xs md:grid-cols-3">
        <StatBox
          title="Rows"
          items={[
            ["Raw rows", String(filtered.length)],
            ["Date range", stats.range],
            [
              "Rows the bank sent >1 identical copy of",
              String(stats.multiCopy),
            ],
            ["Rows without entry_reference", String(stats.noRef)],
            ["entry_reference used by >1 row", String(stats.dupRefs)],
          ]}
        />
        <StatBox title="Status" items={Object.entries(stats.status)} />
        <StatBox
          title="Fields present (rows with a value)"
          items={Object.entries(stats.fields)}
        />
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Booked</TableHead>
            <TableHead>Value</TableHead>
            <TableHead>Tx date</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead>Text</TableHead>
            <TableHead>entry_reference</TableHead>
            <TableHead className="text-right">Seen</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.slice(0, shown).map((r) => {
            const amt = rawAmount(r.raw)
            const open = openId === r.id
            return (
              <Fragment key={r.id}>
                <TableRow
                  className="cursor-pointer text-xs"
                  onClick={() => setOpenId(open ? null : r.id)}
                >
                  <TableCell className="whitespace-nowrap">
                    {String(r.raw.booking_date ?? "—")}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {String(r.raw.value_date ?? "—")}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {String(r.raw.transaction_date ?? "—")}
                  </TableCell>
                  <TableCell>{String(r.raw.status ?? "—")}</TableCell>
                  <TableCell
                    className={cn(
                      "text-right whitespace-nowrap tabular-nums",
                      (amt.value ?? 0) < 0 && "text-destructive",
                    )}
                  >
                    {amt.value === null
                      ? "?"
                      : amt.value.toLocaleString("nb-NO", {
                          minimumFractionDigits: 2,
                        })}{" "}
                    {amt.currency}
                  </TableCell>
                  <TableCell className="max-w-96 truncate">
                    {rawText(r.raw) || "—"}
                  </TableCell>
                  <TableCell className="max-w-40 truncate font-mono">
                    {String(r.raw.entry_reference ?? "—")}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.seen_count}
                    {r.copies > 1 && (
                      <Badge variant="destructive" className="ml-1">
                        ×{r.copies}
                      </Badge>
                    )}
                  </TableCell>
                </TableRow>
                {open && (
                  <TableRow>
                    <TableCell colSpan={8}>
                      <div className="text-muted-foreground mb-1 text-[11px]">
                        Account {names.get(r.account_key) ?? r.account_key} ·
                        first seen {fmtTime(r.first_seen_at)} · last seen{" "}
                        {fmtTime(r.last_seen_at)} · hash{" "}
                        {r.raw_hash.slice(0, 12)}…
                      </div>
                      <pre className="bg-muted max-h-96 overflow-auto p-3 text-[11px] leading-snug">
                        {JSON.stringify(r.raw, null, 2)}
                      </pre>
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            )
          })}
        </TableBody>
      </Table>
      {shown < filtered.length && (
        <Button
          variant="outline"
          onClick={() => setShown(shown + PAGE)}
          className="self-center"
        >
          Show more ({filtered.length - shown} left)
        </Button>
      )}
    </div>
  )
}

function StatBox({
  title,
  items,
}: {
  title: string
  items: [string, string | number][]
}) {
  return (
    <div className="border p-3">
      <div className="mb-2 font-semibold tracking-wider uppercase">{title}</div>
      {items.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-2 border-t py-0.5">
          <span className="text-muted-foreground break-all">{k}</span>
          <span className="tabular-nums">{v}</span>
        </div>
      ))}
    </div>
  )
}

function hasValue(v: unknown): boolean {
  if (v === null || v === undefined || v === "") return false
  if (Array.isArray(v)) return v.length > 0
  if (typeof v === "object") return Object.values(v as object).some(hasValue)
  return true
}

function fieldStats(rows: RawTransaction[]) {
  const fields: Record<string, number> = {}
  const status: Record<string, number> = {}
  const refs = new Map<string, number>()
  let noRef = 0
  let multiCopy = 0
  let min = ""
  let max = ""
  for (const r of rows) {
    for (const [k, v] of Object.entries(r.raw)) {
      if (hasValue(v)) fields[k] = (fields[k] ?? 0) + 1
    }
    const s = String(r.raw.status ?? "(none)")
    status[s] = (status[s] ?? 0) + 1
    const ref = r.raw.entry_reference
    if (ref == null || ref === "") noRef++
    else {
      const k = `${r.account_key}|${ref}`
      refs.set(k, (refs.get(k) ?? 0) + 1)
    }
    if (r.copies > 1) multiCopy++
    const d = rawDate(r.raw)
    if (d && (!min || d < min)) min = d
    if (d && d > max) max = d
  }
  const sortedFields = Object.fromEntries(
    Object.entries(fields)
      .sort((a, b) => b[1] - a[1])
      .map(([k, n]) => [k, String(n)]),
  )
  return {
    fields: sortedFields,
    status: Object.fromEntries(
      Object.entries(status).map(([k, n]) => [k, String(n)]),
    ),
    noRef,
    multiCopy,
    dupRefs: [...refs.values()].filter((n) => n > 1).length,
    range: min ? `${min} → ${max}` : "—",
  }
}
