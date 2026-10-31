// Demo mode: shows your own account with every amount hidden as ***** (the
// shared number formatters check it), for screen sharing. Saving is off while
// it's on, so nothing changes by accident mid-demo. Stored client-side, like
// the other display settings; toggling remounts the app (DateModeBoundary).
import { useSyncExternalStore } from "react"

const KEY = "budget.demoMode"
let cached: boolean | null = null
const listeners = new Set<() => void>()

export const MASK = "*****"

export function isDemoMode(): boolean {
  if (cached == null) {
    cached =
      typeof window !== "undefined" && localStorage.getItem(KEY) === "true"
  }
  return cached
}

export function setDemoMode(on: boolean): void {
  cached = on
  if (on) {
    localStorage.setItem(KEY, "true")
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
  return useSyncExternalStore(subscribe, isDemoMode, () => false)
}

/** fetch for the Supabase client: refuses table writes while demo mode is on. */
export async function demoFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const url = new URL(input instanceof Request ? input.url : String(input))
  const method = (
    init?.method ?? (input instanceof Request ? input.method : "GET")
  ).toUpperCase()
  if (
    isDemoMode() &&
    url.pathname.includes("/rest/v1/") &&
    method !== "GET" &&
    method !== "HEAD"
  ) {
    return new Response(
      JSON.stringify({
        message: "Demo mode is on — turn it off in Settings to make changes.",
        code: "demo",
      }),
      { status: 403, headers: { "Content-Type": "application/json" } },
    )
  }
  return fetch(input, init)
}
