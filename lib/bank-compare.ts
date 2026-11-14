// Read-only comparison of staged bank data (Enable Banking) against the
// transactions already imported from CSV. It changes nothing — it only answers
// "if we imported this, what would match, what would be new, and what is
// uncertain?", so a safe import rule can be designed from real data.

import { type RawTransaction, rawAmount, rawText } from "@/lib/bank"
import type { Transaction } from "@/lib/types"

const WINDOW_DAYS = 4

export type MatchKind = "exact" | "close" | "none"

export type RawRow = {
  raw: RawTransaction
  date: string // booking date, else transaction/value date
  cents: number | null
  text: string
  status: string
}

export type CompareRow = {
  bank: RawRow
  kind: MatchKind
  match: Transaction | null
  dayDiff: number | null
  candidates: number // how many CSV rows could have been the match
  accountMatch: boolean
  where: "before-csv" | "in-csv-range" | "after-csv"
}

export type AccountCompare = {
  accountKey: string
  bankRange: [string, string] | null
  rows: CompareRow[]
  superseded: RawTransaction[] // older versions (e.g. pending later booked)
  csvOnly: Transaction[] // CSV rows for this account in the bank's range with no bank match
}

export type CompareResult = {
  csvRange: [string, string] | null
  accounts: AccountCompare[]
}

const digits = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "")

function dayNum(iso: string): number {
  return Math.floor(Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) / 86_400_000)
}

function toCents(n: number): number {
  return Math.round(n * 100)
}

/** Norwegian IBAN "NOkk" + 11-digit account number → the account number. */
export function accountNumber(accountKey: string): string | null {
  return /^NO\d{13}$/.test(accountKey.replace(/\s/g, ""))
    ? accountKey.replace(/\s/g, "").slice(4)
    : null
}

function toRawRow(r: RawTransaction): RawRow {
  const a = rawAmount(r.raw)
  const date = String(
    r.raw.booking_date ?? r.raw.transaction_date ?? r.raw.value_date ?? "",
  )
  return {
    raw: r,
    date,
    cents: a.value === null ? null : toCents(a.value),
    text: rawText(r.raw),
    status: String(r.raw.status ?? ""),
  }
}

/** All dates on a raw row the CSV's booked/tx date might correspond to. */
function rawDays(r: RawRow): number[] {
  const out = new Set<number>()
  for (const k of ["booking_date", "transaction_date", "value_date"]) {
    const v = r.raw.raw[k]
    if (typeof v === "string" && v) out.add(dayNum(v))
  }
  return [...out]
}

function txDays(t: Transaction): number[] {
  const out = [dayNum(t.booked_date)]
  if (t.tx_date) out.push(dayNum(t.tx_date))
  return out
}

function minDiff(a: number[], b: number[]): number {
  let best = Infinity
  for (const x of a) for (const y of b) best = Math.min(best, Math.abs(x - y))
  return best
}

function touchesAccount(t: Transaction, acct: string | null): boolean {
  if (!acct) return false
  return digits(t.from_account) === acct || digits(t.to_account) === acct
}

export function compareBankToCsv(
  raws: RawTransaction[],
  txs: Transaction[],
): CompareResult {
  const csvDates = txs.map((t) => t.booked_date).sort()
  const csvRange: [string, string] | null = csvDates.length
    ? [csvDates[0], csvDates[csvDates.length - 1]]
    : null

  // CSV rows by exact amount in øre.
  const byCents = new Map<number, Transaction[]>()
  for (const t of txs) {
    const c = toCents(Number(t.amount))
    const list = byCents.get(c)
    if (list) list.push(t)
    else byCents.set(c, [t])
  }

  const used = new Set<string>() // a CSV row can match only one bank row
  const accounts: AccountCompare[] = []

  const keys = [...new Set(raws.map((r) => r.account_key))]
  for (const key of keys) {
    const mine = raws.filter((r) => r.account_key === key)
    // "Current" = rows the most recent fetch of this account returned.
    const latest = mine.reduce((a, b) =>
      a.last_seen_at > b.last_seen_at ? a : b,
    )
    const current = mine.filter((r) => r.last_fetch_id === latest.last_fetch_id)
    const superseded = mine.filter(
      (r) => r.last_fetch_id !== latest.last_fetch_id,
    )
    const acct = accountNumber(key)
    const rows = current.map(toRawRow)

    // Candidates per bank row.
    const cands = rows.map((r) => {
      if (r.cents === null) return []
      const days = rawDays(r)
      return (byCents.get(r.cents) ?? [])
        .map((t) => ({
          t,
          diff: minDiff(days, txDays(t)),
          acct: touchesAccount(t, acct),
        }))
        .filter((c) => c.diff <= WINDOW_DAYS)
    })

    // Assign the least ambiguous rows first, so an obvious match isn't stolen.
    const order = rows
      .map((_, i) => i)
      .sort((a, b) => cands[a].length - cands[b].length)
    const result: CompareRow[] = new Array(rows.length)
    for (const i of order) {
      const r = rows[i]
      const free = cands[i]
        .filter((c) => !used.has(c.t.id))
        .sort((a, b) => Number(b.acct) - Number(a.acct) || a.diff - b.diff)
      const best = free[0]
      if (best) used.add(best.t.id)
      const where: CompareRow["where"] = !csvRange
        ? "after-csv"
        : r.date < csvRange[0]
          ? "before-csv"
          : r.date > csvRange[1]
            ? "after-csv"
            : "in-csv-range"
      result[i] = {
        bank: r,
        kind: !best ? "none" : best.diff === 0 ? "exact" : "close",
        match: best?.t ?? null,
        dayDiff: best?.diff ?? null,
        candidates: cands[i].length,
        accountMatch: best?.acct ?? false,
        where,
      }
    }

    const bankDates = rows
      .map((r) => r.date)
      .filter(Boolean)
      .sort()
    const bankRange: [string, string] | null = bankDates.length
      ? [bankDates[0], bankDates[bankDates.length - 1]]
      : null

    accounts.push({
      accountKey: key,
      bankRange,
      rows: result.sort((a, b) => b.bank.date.localeCompare(a.bank.date)),
      superseded,
      csvOnly: [], // filled below, once every account has claimed its matches
    })
  }

  // CSV rows that belong to an account (by account number) inside that
  // account's bank date range, but that no bank row matched.
  for (const a of accounts) {
    const acct = accountNumber(a.accountKey)
    if (!a.bankRange || !acct) continue
    const [from, to] = a.bankRange
    a.csvOnly = txs
      .filter(
        (t) =>
          !used.has(t.id) &&
          touchesAccount(t, acct) &&
          t.booked_date >= from &&
          t.booked_date <= to,
      )
      .sort((x, y) => y.booked_date.localeCompare(x.booked_date))
  }

  return { csvRange, accounts }
}
