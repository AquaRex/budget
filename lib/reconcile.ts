// Duplicate-proof matching between transaction sources (bank API, CSV, the
// stored list). Pure and dependency-free so it can be tested on real exports.
//
// Why counting: this bank sends no unique transaction id (entry_reference is
// "21"/"22" on every card purchase), and two identical purchases on the same day
// arrive as byte-identical rows. So a transaction is identified by
//   (own account, booking date, amount in øre)
// and duplicates are prevented by COUNTING: if the bank has 3 of a key and the
// list already has 3, nothing is added. Booking dates sometimes move a few days
// (preliminary transfers/eFaktura get re-dated), so after exact-date matching a
// second pass pairs the same account + amount within a few days.

export type Leg = { account: string; date: string; cents: number }

export type Pair<I, E> = { incoming: I; existing: E; dayDiff: number }

export type ReconcileResult<I, E> = {
  exact: Pair<I, E>[]
  shifted: Pair<I, E>[]
  /** Not in the list — safe to add. */
  fresh: I[]
  /** Not matched, but an unmatched list row with the same account + amount is
   *  nearby — could be the same transaction re-dated. Never added automatically. */
  held: { incoming: I; near: E[] }[]
  /** List rows no incoming row accounts for. */
  unmatched: E[]
}

export const MATCH_DAYS = 4
export const HOLD_DAYS = 10

export const digits = (s: string | null | undefined) =>
  (s ?? "").replace(/\D/g, "")

export function dayNum(iso: string): number {
  return Math.floor(Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) / 86_400_000)
}

export function toCents(amount: number | string): number {
  return Math.round(Number(amount) * 100)
}

/** The leg of a stored/CSV transaction: own account is "from" when money goes out. */
export function txLeg(t: {
  amount: number | string
  from_account: string | null
  to_account: string | null
  booked_date: string
}): Leg {
  const cents = toCents(t.amount)
  return {
    account: digits(cents < 0 ? t.from_account : t.to_account),
    date: t.booked_date.slice(0, 10),
    cents,
  }
}

const keyOf = (l: Leg) => `${l.account}|${l.cents}`

export function reconcile<I extends Leg, E extends Leg>(
  incoming: I[],
  existing: E[],
  opts: { matchDays?: number; holdDays?: number } = {},
): ReconcileResult<I, E> {
  const matchDays = opts.matchDays ?? MATCH_DAYS
  const holdDays = opts.holdDays ?? HOLD_DAYS

  const pool = new Map<string, { e: E; day: number; used: boolean }[]>()
  for (const e of existing) {
    const list = pool.get(keyOf(e)) ?? []
    list.push({ e, day: dayNum(e.date), used: false })
    pool.set(keyOf(e), list)
  }

  const exact: Pair<I, E>[] = []
  const shifted: Pair<I, E>[] = []
  const rest: I[] = []

  // Pass 1: exact date.
  for (const i of incoming) {
    const d = dayNum(i.date)
    const hit = pool.get(keyOf(i))?.find((c) => !c.used && c.day === d)
    if (hit) {
      hit.used = true
      exact.push({ incoming: i, existing: hit.e, dayDiff: 0 })
    } else {
      rest.push(i)
    }
  }

  // Pass 2: same account + amount, closest date within matchDays.
  const fresh: I[] = []
  const unplaced: I[] = []
  for (const i of rest) {
    const d = dayNum(i.date)
    const hit = (pool.get(keyOf(i)) ?? [])
      .filter((c) => !c.used && Math.abs(c.day - d) <= matchDays)
      .sort((a, b) => Math.abs(a.day - d) - Math.abs(b.day - d))[0]
    if (hit) {
      hit.used = true
      shifted.push({
        incoming: i,
        existing: hit.e,
        dayDiff: Math.abs(hit.day - d),
      })
    } else {
      unplaced.push(i)
    }
  }

  // Pass 3: anything left with an unmatched look-alike nearby is held.
  const held: { incoming: I; near: E[] }[] = []
  for (const i of unplaced) {
    const d = dayNum(i.date)
    const near = (pool.get(keyOf(i)) ?? [])
      .filter((c) => !c.used && Math.abs(c.day - d) <= holdDays)
      .map((c) => c.e)
    if (near.length) held.push({ incoming: i, near })
    else fresh.push(i)
  }

  const unmatched: E[] = []
  for (const list of pool.values()) {
    for (const c of list) if (!c.used) unmatched.push(c.e)
  }
  return { exact, shifted, fresh, held, unmatched }
}

// ---------------------------------------------------------------- bank rows

export type StagedRaw = {
  id: string
  account_key: string
  raw: Record<string, unknown>
  raw_hash: string
  copies: number
  first_seen_at: string
  last_seen_at: string
}

export type BankTx = Leg & {
  raw: Record<string, unknown>
  stagedId: string
  /** 0-based index among identical bank rows of the same key. */
  occurrence: number
}

/** Norwegian IBAN (NOkk + 11 digits) → the 11-digit account number. */
export function accountFromKey(key: string): string {
  const k = key.replace(/\s/g, "")
  return /^NO\d{13}$/.test(k) ? k.slice(4) : digits(k)
}

export function rawCents(raw: Record<string, unknown>): number | null {
  const a = raw.transaction_amount as { amount?: string } | undefined
  if (a?.amount == null) return null
  const n = Math.abs(toCents(a.amount))
  return raw.credit_debit_indicator === "DBIT" ? -n : n
}

/**
 * The booked bank transactions, one entry per real transaction.
 *
 * Staging keeps every distinct version of a row the bank ever sent. How many
 * transactions a (account, date, amount) key really has = the most copies that
 * were present AT THE SAME TIME (overlapping first_seen..last_seen). So a row the
 * bank later corrected is not counted twice, but 3 identical purchases are 3.
 * Pending rows and 0.00 rows are left out (pending ones arrive later as booked).
 */
export function bankTransactions(staged: StagedRaw[]): BankTx[] {
  const groups = new Map<string, { leg: Leg; rows: StagedRaw[] }>()
  for (const s of staged) {
    if (s.raw.status !== "BOOK") continue
    const cents = rawCents(s.raw)
    const date = String(s.raw.booking_date ?? "")
    if (!cents || !date) continue
    const leg = { account: accountFromKey(s.account_key), date, cents }
    const k = `${leg.account}|${leg.date}|${leg.cents}`
    const g = groups.get(k) ?? { leg, rows: [] }
    g.rows.push(s)
    groups.set(k, g)
  }

  const out: BankTx[] = []
  for (const { leg, rows } of groups.values()) {
    let n = 0
    for (const t of new Set(
      rows.flatMap((r) => [r.first_seen_at, r.last_seen_at]),
    )) {
      let at = 0
      for (const r of rows)
        if (r.first_seen_at <= t && t <= r.last_seen_at) at += r.copies
      n = Math.max(n, at)
    }
    // Represent them with the most recently seen versions.
    const ordered = [...rows].sort((a, b) =>
      b.last_seen_at.localeCompare(a.last_seen_at),
    )
    let occ = 0
    for (const r of ordered) {
      for (let c = 0; c < r.copies && occ < n; c++) {
        out.push({ ...leg, raw: r.raw, stagedId: r.id, occurrence: occ++ })
      }
    }
  }
  return out.sort(
    (a, b) =>
      a.date.localeCompare(b.date) || a.account.localeCompare(b.account),
  )
}

/** Text shown for a bank row: payer/payee name + remittance lines. */
export function bankText(raw: Record<string, unknown>): string {
  const rem = raw.remittance_information
  const lines = Array.isArray(rem) ? rem.map(String) : rem ? [String(rem)] : []
  return lines.join(" ").replace(/\s+/g, " ").trim()
}

/** The other party's account number on a bank row, if any. */
export function counterpartAccount(
  raw: Record<string, unknown>,
): string | null {
  const side = (
    raw.credit_debit_indicator === "DBIT"
      ? raw.creditor_account
      : raw.debtor_account
  ) as
    | {
        iban?: string | null
        other?: { identification?: string | null } | null
      }
    | null
    | undefined
  const id = side?.iban
    ? accountFromKey(side.iban)
    : (side?.other?.identification ?? "")
  return id ? digits(id) : null
}
