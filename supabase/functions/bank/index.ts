// Bank connection via Enable Banking (PSD2 account information) — STAGE 1.
//
// Stores raw bank data in the bank_* staging tables only. It never reads,
// writes or deletes public.transactions.
//
// All requests are JSON POST from the signed-in site (aal2 required):
//   { "action": "aspsps" }                                   → banks in Norway
//   { "action": "start", aspsp_name, aspsp_country, redirect_url } → { url } to the bank's BankID login
//   { "action": "callback", code, state }                    → stores the session (consent)
//   { "action": "fetch" }                                    → pulls raw data (max 4/day)
//   { "action": "disconnect", session_id }                   → ends a session
//
// Secrets (supabase secrets set …):
//   ENABLEBANKING_APP_ID       the application id (JWT "kid")
//   ENABLEBANKING_PRIVATE_KEY  the .pem downloaded when the app was registered
//   BANK_REDIRECT_URLS         comma-separated allowed redirect URLs (must match Enable Banking's list)
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2"

const EB = "https://api.enablebanking.com"
const DAILY_LIMIT = 4 // the PSD2 limit for unattended access; keep in sync with BANK_DAILY_LIMIT in lib/bank.ts
const DEMO_EMAIL = "demo@demo.com"
const MAX_PAGES = 200

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } })

class HttpError extends Error {
  constructor(public status: number, message: string, public detail?: unknown) {
    super(message)
  }
}

function env(name: string): string {
  const v = Deno.env.get(name)
  if (!v) {
    throw new HttpError(500, `Server is missing the ${name} secret.`)
  }
  return v
}

// ---------------------------------------------------------------- JWT for EB

const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
const b64urlJson = (o: unknown) => b64url(new TextEncoder().encode(JSON.stringify(o)))

let signingKey: CryptoKey | null = null

async function getSigningKey(): Promise<CryptoKey> {
  if (signingKey) {
    return signingKey
  }
  const pem = env("ENABLEBANKING_PRIVATE_KEY").replace(/\\n/g, "\n")
  if (pem.includes("BEGIN RSA PRIVATE KEY")) {
    throw new HttpError(500, "Private key is PKCS#1; convert it to PKCS#8 (BEGIN PRIVATE KEY).")
  }
  const body = pem.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, "").replace(/\s+/g, "")
  const der = Uint8Array.from(atob(body), (c) => c.charCodeAt(0))
  try {
    signingKey = await crypto.subtle.importKey(
      "pkcs8",
      der,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["sign"],
    )
  } catch {
    throw new HttpError(500, "Could not read ENABLEBANKING_PRIVATE_KEY — is it the full .pem file?")
  }
  return signingKey
}

async function ebToken(): Promise<string> {
  const iat = Math.floor(Date.now() / 1000)
  const head = b64urlJson({ typ: "JWT", alg: "RS256", kid: env("ENABLEBANKING_APP_ID") })
  const claims = b64urlJson({ iss: "enablebanking.com", aud: "api.enablebanking.com", iat, exp: iat + 3600 })
  const input = `${head}.${claims}`
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", await getSigningKey(), new TextEncoder().encode(input))
  return `${input}.${b64url(new Uint8Array(sig))}`
}

async function eb<T = Record<string, unknown>>(
  path: string,
  opts: { method?: string; body?: unknown; headers?: Record<string, string> } = {},
): Promise<T> {
  const res = await fetch(`${EB}${path}`, {
    method: opts.method ?? "GET",
    headers: {
      Authorization: `Bearer ${await ebToken()}`,
      "Content-Type": "application/json",
      ...(opts.headers ?? {}),
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  })
  const text = await res.text()
  let data: unknown = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = text
  }
  if (!res.ok) {
    const d = data as { message?: string; error?: string } | null
    const msg = d?.message || d?.error || (typeof data === "string" ? data : "") || res.statusText
    throw new HttpError(502, `Enable Banking ${opts.method ?? "GET"} ${path.split("?")[0]} failed (${res.status}): ${msg}`, data)
  }
  return data as T
}

// ---------------------------------------------------------------- helpers

type Aspsp = {
  name: string
  country: string
  beta?: boolean
  maximum_consent_validity?: number
  required_psu_headers?: string[]
}

async function listAspsps(country = "NO"): Promise<Aspsp[]> {
  const r = await eb<{ aspsps: Aspsp[] }>(`/aspsps?country=${encodeURIComponent(country)}&psu_type=personal&service=AIS`)
  return r.aspsps ?? []
}

function osloDate(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Oslo" }).format(d)
}

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10)
}

type SessionAccount = {
  uid?: string
  name?: string
  product?: string
  cash_account_type?: string
  currency?: string
  account_id?: { iban?: string; other?: { identification?: string } }
  identification_hash?: string
}

/** A stable id for an account across sessions (uid changes per session). */
function accountKey(a: SessionAccount): string {
  return a.account_id?.iban || a.identification_hash || a.account_id?.other?.identification || a.uid || "unknown"
}

/** PSU headers tell the bank the user is present (they clicked the button). Send all required ones or none. */
function psuHeaders(req: Request, aspsp: Aspsp | undefined): Record<string, string> {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
  const have: Record<string, string | undefined> = {
    "psu-ip-address": ip,
    "psu-user-agent": req.headers.get("user-agent") ?? undefined,
    "psu-accept": req.headers.get("accept") ?? undefined,
    "psu-accept-language": req.headers.get("accept-language") ?? undefined,
  }
  const required = (aspsp?.required_psu_headers ?? []).map((h) => h.toLowerCase())
  const wanted = required.length ? required : ["psu-ip-address", "psu-user-agent"]
  const out: Record<string, string> = {}
  for (const h of wanted) {
    const v = have[h]
    if (!v) {
      return {} // can't satisfy all of them → send none
    }
    out[h] = v
  }
  return out
}

// ---------------------------------------------------------------- actions

async function actionStart(admin: SupabaseClient, userId: string, body: Record<string, unknown>) {
  const name = String(body.aspsp_name ?? "")
  const country = String(body.aspsp_country ?? "NO")
  const redirect = String(body.redirect_url ?? "")
  const allowed = env("BANK_REDIRECT_URLS").split(",").map((s) => s.trim()).filter(Boolean)
  if (!allowed.includes(redirect)) {
    throw new HttpError(400, `Redirect URL not allowed: ${redirect}. Add it to BANK_REDIRECT_URLS and to the app in Enable Banking.`)
  }
  const aspsp = (await listAspsps(country)).find((a) => a.name === name)
  if (!aspsp) {
    throw new HttpError(400, `Unknown bank: ${name}`)
  }
  // Consent as long as the bank allows (usually 180 days), minus an hour of margin.
  const maxSec = Math.min(aspsp.maximum_consent_validity ?? 90 * 86400, 180 * 86400)
  const validUntil = new Date(Date.now() + (maxSec - 3600) * 1000).toISOString()

  const { data: reqRow, error } = await admin
    .from("bank_auth_requests")
    .insert({ user_id: userId, aspsp_name: name, aspsp_country: country, redirect_url: redirect })
    .select("state")
    .single()
  if (error) {
    throw new HttpError(500, `Could not save auth request: ${error.message}`)
  }

  const auth = await eb<{ url: string }>("/auth", {
    method: "POST",
    body: {
      access: { valid_until: validUntil },
      aspsp: { name, country },
      state: reqRow.state,
      redirect_url: redirect,
      psu_type: "personal",
    },
  })
  return { url: auth.url }
}

async function actionCallback(admin: SupabaseClient, userId: string, body: Record<string, unknown>) {
  const code = String(body.code ?? "")
  const state = String(body.state ?? "")
  if (!code || !state) {
    throw new HttpError(400, "Missing code or state from the bank redirect.")
  }
  // Claim the auth request atomically: must be ours, unused and recent.
  const since = new Date(Date.now() - 30 * 60_000).toISOString()
  const { data: claimed, error } = await admin
    .from("bank_auth_requests")
    .update({ used_at: new Date().toISOString() })
    .eq("state", state)
    .eq("user_id", userId)
    .is("used_at", null)
    .gte("created_at", since)
    .select("aspsp_name, aspsp_country")
  if (error) {
    throw new HttpError(500, error.message)
  }
  if (!claimed?.length) {
    throw new HttpError(400, "This bank login link is unknown, expired or already used. Start again with Connect.")
  }

  const session = await eb<{
    session_id: string
    aspsp?: { name: string; country: string }
    access?: { valid_until?: string }
    accounts?: SessionAccount[]
  }>("/sessions", { method: "POST", body: { code } })

  const aspspName = session.aspsp?.name ?? claimed[0].aspsp_name
  const aspspCountry = session.aspsp?.country ?? claimed[0].aspsp_country

  // A new consent replaces older ones for the same bank (fetching both would just double the calls).
  await admin
    .from("bank_sessions")
    .update({ revoked_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("aspsp_name", aspspName)
    .is("revoked_at", null)

  const { error: insErr } = await admin.from("bank_sessions").insert({
    user_id: userId,
    session_id: session.session_id,
    aspsp_name: aspspName,
    aspsp_country: aspspCountry,
    valid_until: session.access?.valid_until ?? null,
    accounts: session.accounts ?? [],
    raw: session,
  })
  if (insErr) {
    throw new HttpError(500, `Could not save session: ${insErr.message}`)
  }
  return { accounts: (session.accounts ?? []).length, bank: aspspName }
}

async function actionDisconnect(admin: SupabaseClient, userId: string, body: Record<string, unknown>) {
  const sessionId = String(body.session_id ?? "")
  const { data } = await admin
    .from("bank_sessions")
    .select("id")
    .eq("user_id", userId)
    .eq("session_id", sessionId)
    .maybeSingle()
  if (!data) {
    throw new HttpError(404, "Session not found.")
  }
  try {
    await eb(`/sessions/${encodeURIComponent(sessionId)}`, { method: "DELETE" })
  } catch {
    // Already expired/closed at the bank — still mark it revoked here.
  }
  await admin.from("bank_sessions").update({ revoked_at: new Date().toISOString() }).eq("id", data.id)
  return { ok: true }
}

async function fetchAllTransactions(
  uid: string,
  query: Record<string, string>,
  headers: Record<string, string>,
): Promise<{ rows: unknown[]; pages: number }> {
  const rows: unknown[] = []
  let key: string | undefined
  let pages = 0
  do {
    const q = new URLSearchParams(query)
    if (key) {
      q.set("continuation_key", key)
    }
    const r = await eb<{ transactions?: unknown[]; continuation_key?: string | null }>(
      `/accounts/${encodeURIComponent(uid)}/transactions?${q}`,
      { headers },
    )
    rows.push(...(r.transactions ?? []))
    key = r.continuation_key ?? undefined
    pages++
  } while (key && pages < MAX_PAGES)
  return { rows, pages }
}

async function actionFetch(admin: SupabaseClient, userId: string, req: Request) {
  const { data: sessions, error: sErr } = await admin
    .from("bank_sessions")
    .select("session_id, aspsp_name, aspsp_country, accounts, valid_until")
    .eq("user_id", userId)
    .is("revoked_at", null)
  if (sErr) {
    throw new HttpError(500, sErr.message)
  }
  const active = (sessions ?? []).filter((s) => !s.valid_until || new Date(s.valid_until) > new Date())
  if (!active.length) {
    throw new HttpError(400, "No active bank connection. Connect (or reconnect) your bank first.")
  }

  const { data: fetchId, error: bErr } = await admin.rpc("bank_begin_fetch", {
    p_user_id: userId,
    p_limit: DAILY_LIMIT,
  })
  if (bErr) {
    throw new HttpError(500, bErr.message)
  }
  if (!fetchId) {
    throw new HttpError(429, `Daily limit reached (${DAILY_LIMIT} updates per day). Try again tomorrow.`)
  }

  const accountsSummary: Record<string, unknown>[] = []
  let failures = 0
  let total = 0
  try {
    const aspspCache = new Map<string, Aspsp[]>()
    for (const s of active) {
      if (!aspspCache.has(s.aspsp_country)) {
        aspspCache.set(s.aspsp_country, await listAspsps(s.aspsp_country).catch(() => []))
      }
      const aspsp = aspspCache.get(s.aspsp_country)!.find((a) => a.name === s.aspsp_name)
      const headers = psuHeaders(req, aspsp)

      for (const acc of (s.accounts ?? []) as SessionAccount[]) {
        total++
        const key = accountKey(acc)
        const entry: Record<string, unknown> = {
          account_key: key,
          name: acc.name ?? null,
          product: acc.product ?? null,
          cash_account_type: acc.cash_account_type ?? null,
          bank: s.aspsp_name,
        }
        accountsSummary.push(entry)
        if (!acc.uid) {
          entry.error = "Account has no uid in this session."
          failures++
          continue
        }
        try {
          entry.details = await eb(`/accounts/${encodeURIComponent(acc.uid)}/details`, { headers }).catch((e) => ({
            error: String(e.message ?? e),
          }))
          entry.balances = await eb(`/accounts/${encodeURIComponent(acc.uid)}/balances`, { headers }).catch((e) => ({
            error: String(e.message ?? e),
          }))

          // First time for this account: ask for the longest history the bank allows.
          // Later: from 14 days before the last time we saw data, so pending -> booked
          // changes are caught and there's never a gap.
          const { data: last } = await admin
            .from("bank_raw_transactions")
            .select("last_seen_at")
            .eq("user_id", userId)
            .eq("account_key", key)
            .order("last_seen_at", { ascending: false })
            .limit(1)
            .maybeSingle()

          let result: { rows: unknown[]; pages: number }
          if (!last) {
            try {
              result = await fetchAllTransactions(acc.uid, { strategy: "longest" }, headers)
              entry.strategy = "longest"
            } catch (e) {
              entry.longest_error = String((e as Error).message ?? e)
              result = await fetchAllTransactions(acc.uid, { date_from: isoDaysAgo(89) }, headers)
              entry.strategy = "default, last 89 days"
            }
          } else {
            const from = new Date(new Date(last.last_seen_at).getTime() - 14 * 86_400_000).toISOString().slice(0, 10)
            result = await fetchAllTransactions(acc.uid, { date_from: from }, headers)
            entry.strategy = `default, from ${from}`
          }
          entry.fetched = result.rows.length
          entry.pages = result.pages

          const { data: staged, error: stErr } = await admin.rpc("bank_stage_transactions", {
            p_user_id: userId,
            p_fetch_id: fetchId,
            p_session_id: s.session_id,
            p_account_uid: acc.uid,
            p_account_key: key,
            p_rows: result.rows,
          })
          if (stErr) {
            throw new Error(`Staging failed: ${stErr.message}`)
          }
          const row = Array.isArray(staged) ? staged[0] : staged
          entry.new = row?.inserted ?? 0
          entry.known = row?.known ?? 0
        } catch (e) {
          entry.error = String((e as Error).message ?? e)
          failures++
        }
      }
    }
  } catch (e) {
    await admin
      .from("bank_fetches")
      .update({
        status: "error",
        error: String((e as Error).message ?? e),
        finished_at: new Date().toISOString(),
        summary: { accounts: accountsSummary },
      })
      .eq("id", fetchId)
    throw e
  }

  const status = failures === 0 ? "ok" : failures < total ? "partial" : "error"
  await admin
    .from("bank_fetches")
    .update({
      status,
      error: failures ? `${failures} of ${total} accounts failed` : null,
      finished_at: new Date().toISOString(),
      summary: { accounts: accountsSummary },
    })
    .eq("id", fetchId)

  return { status, accounts: accountsSummary, date: osloDate() }
}

// ---------------------------------------------------------------- entry

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors })
  }
  if (req.method !== "POST") {
    return json({ error: "POST only" }, 405)
  }
  try {
    const admin = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    // Who is calling? getUser validates the token with Supabase Auth.
    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "")
    const { data: userData, error: userErr } = await admin.auth.getUser(jwt)
    const user = userData?.user
    if (userErr || !user) {
      throw new HttpError(401, "Not signed in.")
    }
    // Token is verified above, so its claims can be trusted.
    const claims = JSON.parse(atob(jwt.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")))
    if (claims.aal !== "aal2") {
      throw new HttpError(403, "Two-factor sign-in (aal2) is required.")
    }
    if ((user.email ?? "").toLowerCase() === DEMO_EMAIL) {
      throw new HttpError(403, "Bank connections are not available for the demo account.")
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    switch (body.action) {
      case "aspsps":
        return json({
          aspsps: (await listAspsps(String(body.country ?? "NO"))).map((a) => ({
            name: a.name,
            country: a.country,
            beta: a.beta ?? false,
            maximum_consent_validity: a.maximum_consent_validity ?? null,
          })),
        })
      case "start":
        return json(await actionStart(admin, user.id, body))
      case "callback":
        return json(await actionCallback(admin, user.id, body))
      case "fetch":
        return json(await actionFetch(admin, user.id, req))
      case "disconnect":
        return json(await actionDisconnect(admin, user.id, body))
      default:
        throw new HttpError(400, `Unknown action: ${String(body.action)}`)
    }
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500
    return json({ error: String((e as Error).message ?? e) }, status)
  }
})
