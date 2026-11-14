"use client"

// Bank connection (Enable Banking / PSD2). Pulling from the bank goes through
// the `bank` Edge Function into the bank_* tables (kept forever, never changed);
// lib/bank-import.ts then adds what's new to the transaction list.

import useSWR, { mutate } from "swr"

import { type BankImportResult, runBankImport } from "@/lib/bank-import"
import { getSupabase } from "@/lib/supabase/client"

/** Pulls by the button per day. A daily automatic pull is on top (1/day); 3 + 1 = the bank's 4. */
export const BANK_DAILY_LIMIT = 3

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
  trigger: "manual" | "auto"
  error: string | null
  summary: { accounts?: FetchAccountSummary[] }
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

/** A button pull that counts towards the daily limit (mirrors bank_begin_fetch_v2). */
export function countsTowardsLimit(f: BankFetch): boolean {
  if (f.trigger !== "manual") return false
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
  imported: BankImportResult
}

/** Pull from the bank, then add whatever is new to the transaction list. */
export async function runBankFetch(): Promise<FetchResult> {
  try {
    const r = await callBank<Omit<FetchResult, "imported">>({ action: "fetch" })
    return { ...r, imported: await runBankImport() }
  } finally {
    await refreshBankData()
  }
}

// ------------------------------------------------------------------ reads

const SESSIONS_KEY = "bank_sessions"
const FETCHES_KEY = "bank_fetches"

export function refreshBankData() {
  return Promise.all([
    mutate(SESSIONS_KEY),
    mutate(FETCHES_KEY),
    mutate("bank_staged"),
    mutate("bank_pending"),
    mutate("bank_balances"),
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

export function useBankSessions() {
  return useSWR(SESSIONS_KEY, fetchSessions)
}

export function useBankFetches() {
  return useSWR(FETCHES_KEY, fetchFetches)
}

/** Today's button pulls used, and when the last automatic pull ran. */
export function useBankUsage() {
  const { data: fetches } = useBankFetches()
  const { data: sessions } = useBankSessions()
  const today = osloToday()
  const used = (fetches ?? []).filter(
    (f) => f.fetch_date === today && countsTowardsLimit(f),
  ).length
  const lastAuto = (fetches ?? []).find(
    (f) =>
      f.trigger === "auto" && (f.status === "ok" || f.status === "partial"),
  )
  return {
    used,
    limit: BANK_DAILY_LIMIT,
    lastAuto: lastAuto?.finished_at ?? null,
    connected: (sessions ?? []).some(isActiveSession),
    loaded: fetches !== undefined && sessions !== undefined,
  }
}

/**
 * A readable account label. The bank's `name` is the account HOLDER's name
 * (the same on every account), so prefer the product, plus the last digits.
 */
export function accountLabel(a: BankAccount): string {
  const iban = a.account_id?.iban
  const tail = iban ? `…${iban.slice(-4)}` : ""
  const base = a.product || a.cash_account_type || a.name || "Account"
  return tail ? `${base} ${tail}` : base
}
