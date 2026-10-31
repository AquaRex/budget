// Demo mode: shows your own account with every amount scrambled, for screen
// sharing. Amounts are scaled per row (per budget entry / holding, so a row's
// months stay consistent) as they arrive from Supabase, so totals and charts
// still add up. Saving is off while it's on, so scrambled numbers can never be
// written back. Stored client-side, like the other display settings.
import { useSyncExternalStore } from "react"

const KEY = "budget.demoMode"
let cached: string | null | undefined
const listeners = new Set<() => void>()

function seed(): string | null {
  if (cached === undefined) {
    cached = typeof window !== "undefined" ? localStorage.getItem(KEY) : null
  }
  return cached
}

export function setDemoMode(on: boolean): void {
  cached = on ? Math.random().toString(36).slice(2) : null
  if (cached) {
    localStorage.setItem(KEY, cached)
  } else {
    localStorage.removeItem(KEY)
  }
  listeners.forEach((l) => l())
}

function subscribe(l: () => void): () => void {
  listeners.add(l)
  return () => listeners.delete(l)
}

export function useDemoMode(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => seed() !== null,
    () => false,
  )
}

type Row = Record<string, unknown>

// Which columns are money, and which column keeps a row's factor stable.
const SCRAMBLE: Record<
  string,
  { key: (r: Row) => unknown; money: string[]; scaled?: string[] }
> = {
  transactions: { key: (r) => r.id, money: ["amount", "pending_amount"] },
  entries: { key: (r) => r.id, money: ["default_amount"] },
  entry_amounts: { key: (r) => r.entry_id, money: ["amount"] },
  salary_settings: { key: () => "salary", money: ["yearly_salary"] },
  bills: { key: (r) => r.id, money: ["amount"] },
  incomes: { key: (r) => r.id, money: ["amount"] },
  // Units scale with the amount, so the price per unit stays the real market price.
  holding_trades: {
    key: (r) => r.holding_id,
    money: ["amount"],
    scaled: ["units"],
  },
}

/** 0.55–1.45, fixed for a given seed and key. */
function factor(s: string, key: unknown): number {
  let h = 2166136261
  for (const ch of `${s}:${String(key)}`) {
    h = Math.imul(h ^ ch.charCodeAt(0), 16777619)
  }
  return 0.55 + (((h >>> 0) % 10_000) / 10_000) * 0.9
}

function scramble(s: string, table: string, rows: Row[]): Row[] {
  const spec = SCRAMBLE[table]
  return rows.map((r) => {
    const f = factor(s, spec.key(r))
    const out = { ...r }
    for (const c of spec.money) {
      if (out[c] != null) {
        out[c] = Math.round(Number(out[c]) * f)
      }
    }
    for (const c of spec.scaled ?? []) {
      if (out[c] != null) {
        out[c] = Number(out[c]) * f
      }
    }
    return out
  })
}

/** fetch for the Supabase client: scrambles table reads and refuses writes while demo mode is on. */
export async function demoFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const s = seed()
  const url = new URL(input instanceof Request ? input.url : String(input))
  const rest = url.pathname.match(/\/rest\/v1\/([^/]+)$/)
  if (!s || !rest) {
    return fetch(input, init)
  }
  const method = (
    init?.method ?? (input instanceof Request ? input.method : "GET")
  ).toUpperCase()
  if (method !== "GET" && method !== "HEAD") {
    return new Response(
      JSON.stringify({
        message: "Demo mode is on — turn it off in Settings to make changes.",
        code: "demo",
      }),
      { status: 403, headers: { "Content-Type": "application/json" } },
    )
  }
  const res = await fetch(input, init)
  const table = rest[1]
  if (!res.ok || method === "HEAD" || !SCRAMBLE[table]) {
    return res
  }
  const body = await res.json()
  if (body === null) {
    return new Response("null", res)
  }
  const data = Array.isArray(body)
    ? scramble(s, table, body)
    : scramble(s, table, [body])[0]
  const headers = new Headers(res.headers)
  headers.delete("content-length")
  headers.delete("content-encoding")
  return new Response(JSON.stringify(data), {
    status: res.status,
    statusText: res.statusText,
    headers,
  })
}
