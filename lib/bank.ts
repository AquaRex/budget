"use client"

// Bank connection (Enable Banking / PSD2) — stage 1: raw data in staging tables
// only. Nothing here touches public.transactions. All writes go through the
// `bank` Edge Function; the site only reads the bank_* tables.

import useSWR, { mutate } from "swr"

import { getSupabase } from "@/lib/supabase/client"

export const BANK_DAILY_LIMIT = 4

export type BankAccount = {
  uid?: string
  name?: string
  product?: string
  cash_account_type?: string
  currency?: string
  account_id?: { iban?: string }
  identification_hash?: string
}

export type BankSession = {
  id: string
  session_id: string
  aspsp_name: string
  aspsp_country: string
  valid_until: string | null
  accounts: BankAccount[]
  created_at: string
  revoked_at: string | null
}

export type FetchAccountSummary = {
  account_key: string
  name: string | null
  product: string | null
  cash_account_type: string | null
  bank: string
  strategy?: string
  fetched?: number
  pages?: number
  new?: number
  known?: number
  error?: string
  longest_error?: string
  details?: unknown
  balances?: unknown
}

export type BankFetch = {
  id: string
  fetch_date: string
  started_at: string
  finished_at: string | null
  status: "running" | "ok" | "partial" | "error"
  error: string | null
  summary: { accounts?: FetchAccountSummary[] }
}

export type RawTransaction = {
  id: string
  account_key: string
  session_id: string
  raw: Record<string, unknown>
  raw_hash: string
  copies: number
  last_fetch_id: string | null
  first_seen_at: string
  last_seen_at: string
  seen_count: number
}

/** Today's date in Norway, yyyy-mm-dd (the daily limit resets at Oslo midnight). */
export function osloToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Oslo" }).format(
    new Date(),
  )
}

/** Where the bank sends you back after BankID. Must be registered in Enable Banking. */
export function bankRedirectUrl(): string {
  const base = process.env.NEXT_PUBLIC_BASE_PATH || ""
  return `${window.location.origin}${base}/settings/bank/`
}

export function isActiveSession(s: BankSession): boolean {
  return (
    !s.revoked_at && (!s.valid_until || new Date(s.valid_until) > new Date())
  )
}

/** A fetch that counts towards the daily limit (mirrors bank_begin_fetch). */
export function countsTowardsLimit(f: BankFetch): boolean {
  if (f.status === "ok" || f.status === "partial") return true
  return (
    f.status === "running" &&
    Date.now() - new Date(f.started_at).getTime() < 15 * 60_000
  )
}

// ------------------------------------------------------------------ function

export async function callBank<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await getSupabase().functions.invoke("bank", {
    body,
  })
  if (error) {
    // Non-2xx: surface the function's own error message, not a generic one.
    const ctx = (error as { context?: Response }).context
    if (ctx && typeof ctx.json === "function") {
      const b = await ctx.json().catch(() => null)
      if (b?.error) throw new Error(b.error)
    }
    throw error
  }
  if (data?.error) throw new Error(data.error)
  return data as T
}

export type Aspsp = {
  name: string
  country: string
  beta: boolean
  maximum_consent_validity: number | null
}

export const listBanks = () =>
  callBank<{ aspsps: Aspsp[] }>({ action: "aspsps", country: "NO" }).then(
    (r) => r.aspsps,
  )

export const startBankAuth = (aspsp: Aspsp) =>
  callBank<{ url: string }>({
    action: "start",
    aspsp_name: aspsp.name,
    aspsp_country: aspsp.country,
    redirect_url: bankRedirectUrl(),
  })

export const completeBankAuth = (code: string, state: string) =>
  callBank<{ accounts: number; bank: string }>({
    action: "callback",
    code,
    state,
  })

export const disconnectBank = (sessionId: string) =>
  callBank<{ ok: true }>({ action: "disconnect", session_id: sessionId })

export type FetchResult = {
  status: BankFetch["status"]
  accounts: FetchAccountSummary[]
}

export async function runBankFetch(): Promise<FetchResult> {
  try {
    return await callBank<FetchResult>({ action: "fetch" })
  } finally {
    await refreshBankData()
  }
}

// ------------------------------------------------------------------ reads

const SESSIONS_KEY = "bank_sessions"
const FETCHES_KEY = "bank_fetches"
const RAW_KEY = "bank_raw_transactions"

export function refreshBankData() {
  return Promise.all([
    mutate(SESSIONS_KEY),
    mutate(FETCHES_KEY),
    mutate(RAW_KEY),
  ])
}

async function fetchSessions(): Promise<BankSession[]> {
  const { data, error } = await getSupabase()
    .from("bank_sessions")
    .select(
      "id, session_id, aspsp_name, aspsp_country, valid_until, accounts, created_at, revoked_at",
    )
    .order("created_at", { ascending: false })
  if (error) throw error
  return (data ?? []) as BankSession[]
}

async function fetchFetches(): Promise<BankFetch[]> {
  const { data, error } = await getSupabase()
    .from("bank_fetches")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(50)
  if (error) throw error
  return (data ?? []) as BankFetch[]
}

async function fetchRaw(): Promise<RawTransaction[]> {
  // PostgREST caps a response at 1000 rows, so page through everything.
  const out: RawTransaction[] = []
  const page = 1000
  for (let from = 0; ; from += page) {
    const { data, error } = await getSupabase()
      .from("bank_raw_transactions")
      .select(
        "id, account_key, session_id, raw, raw_hash, copies, last_fetch_id, first_seen_at, last_seen_at, seen_count",
      )
      .order("first_seen_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + page - 1)
    if (error) throw error
    out.push(...((data ?? []) as RawTransaction[]))
    if (!data || data.length < page) break
  }
  return out
}

export function useBankSessions() {
  return useSWR(SESSIONS_KEY, fetchSessions)
}

export function useBankFetches() {
  return useSWR(FETCHES_KEY, fetchFetches)
}

export function useRawTransactions() {
  return useSWR(RAW_KEY, fetchRaw, { revalidateOnFocus: false })
}

/** How many of today's updates are used, for the header button. */
export function useBankUsage() {
  const { data: fetches } = useBankFetches()
  const { data: sessions } = useBankSessions()
  const today = osloToday()
  const used = (fetches ?? []).filter(
    (f) => f.fetch_date === today && countsTowardsLimit(f),
  ).length
  return {
    used,
    limit: BANK_DAILY_LIMIT,
    connected: (sessions ?? []).some(isActiveSession),
    loaded: fetches !== undefined && sessions !== undefined,
  }
}

// ------------------------------------------------------------------ raw helpers

type Amount = { amount?: string; currency?: string }

/** Signed amount from a raw PSD2 transaction (DBIT = money out). */
export function rawAmount(raw: Record<string, unknown>): {
  value: number | null
  currency: string
} {
  const a = (raw.transaction_amount ?? {}) as Amount
  const n = a.amount != null ? Number(a.amount) : NaN
  if (Number.isNaN(n)) return { value: null, currency: a.currency ?? "" }
  const sign = raw.credit_debit_indicator === "DBIT" ? -1 : 1
  return { value: sign * Math.abs(n), currency: a.currency ?? "" }
}

/** A readable one-line text for a raw transaction. */
export function rawText(raw: Record<string, unknown>): string {
  const parts: string[] = []
  const party =
    raw.credit_debit_indicator === "DBIT" ? raw.creditor : raw.debtor
  const name = (party as { name?: string } | null)?.name
  if (name) parts.push(name)
  const rem = raw.remittance_information
  if (Array.isArray(rem)) parts.push(...rem.map(String))
  else if (typeof rem === "string") parts.push(rem)
  return parts.join(" · ")
}

export function rawDate(raw: Record<string, unknown>): string {
  return String(
    raw.booking_date ?? raw.transaction_date ?? raw.value_date ?? "",
  )
}
