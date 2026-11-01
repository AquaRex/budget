// Demo mode, for showing your own account to others:
//   "scramble"  every amount is scaled per row (per budget entry / holding, so
//               a row's months stay consistent) as it arrives from Supabase, so
//               totals and charts still add up but nothing is real
//   "mask"      every amount is shown as ***** (the shared number formatters
//               check it); the data underneath is real
// Saving is off in both, so scrambled numbers can never be written back and
// nothing changes by accident mid-demo. Stored client-side, like the other
// display settings; switching remounts the app (DateModeBoundary).
import { useSyncExternalStore } from "react"

export type DemoMode = "off" | "scramble" | "mask"

const KEY = "budget.demoMode"
let cached: string | null | undefined
const listeners = new Set<() => void>()

export const MASK = "*****"

// Stored as "mask" or "scramble:<seed>"; a fresh seed each time scrambling is
// switched on, so screenshots from different sessions can't be compared.
function stored(): string | null {
  if (cached === undefined) {
    cached = typeof window !== "undefined" ? localStorage.getItem(KEY) : null
  }
  return cached
}

export function getDemoMode(): DemoMode {
  const s = stored()
  return !s ? "off" : s.startsWith("scramble:") ? "scramble" : "mask"
}

export function isMasked(): boolean {
  return getDemoMode() === "mask"
}

export function setDemoMode(mode: DemoMode): void {
  cached =
    mode === "off"
      ? null
      : mode === "scramble"
        ? `scramble:${Math.random().toString(36).slice(2)}`
        : "mask"
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

export function useDemoMode(): DemoMode {
  return useSyncExternalStore(subscribe, getDemoMode, () => "off")
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
  goals: { key: (r) => r.id, money: ["target_amount", "start_amount"] },
  // Units scale with the amount, so the price per unit stays the real market price.
  holding_trades: {
    key: (r) => r.holding_id,
    money: ["amount"],
    scaled: ["units"],
  },
}

/** 0.55–1.45, fixed for a given seed and key. */
function factor(seed: string, key: unknown): number {
  let h = 2166136261
  for (const ch of `${seed}:${String(key)}`) {
    h = Math.imul(h ^ ch.charCodeAt(0), 16777619)
  }
  return 0.55 + (((h >>> 0) % 10_000) / 10_000) * 0.9
}

function scramble(seed: string, table: string, rows: Row[]): Row[] {
  const spec = SCRAMBLE[table]
  return rows.map((r) => {
    const f = factor(seed, spec.key(r))
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

/** fetch for the Supabase client: refuses table writes in demo mode, and scrambles table reads when scrambling. */
export async function demoFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const mode = getDemoMode()
  const url = new URL(input instanceof Request ? input.url : String(input))
  const rest = url.pathname.match(/\/rest\/v1\/([^/]+)$/)
  if (mode === "off" || !rest) {
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
  if (mode !== "scramble" || !res.ok || method === "HEAD" || !SCRAMBLE[table]) {
    return res
  }
  const body = await res.json()
  if (body === null) {
    return new Response("null", res)
  }
  const seed = (stored() as string).slice("scramble:".length)
  const data = Array.isArray(body)
    ? scramble(seed, table, body)
    : scramble(seed, table, [body])[0]
  const headers = new Headers(res.headers)
  headers.delete("content-length")
  headers.delete("content-encoding")
  return new Response(JSON.stringify(data), {
    status: res.status,
    statusText: res.statusText,
    headers,
  })
}
