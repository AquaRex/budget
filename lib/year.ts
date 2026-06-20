// The globally selected budget year. Scopes both the budget (entries / amounts
// / salary) and the actual-spending views. Persisted client-side (single user).
import { useSyncExternalStore } from "react"

const KEY = "budget.year"
const DEFAULT = new Date().getFullYear()

let cached: number | null = null
const listeners = new Set<() => void>()

function read(): number {
  if (cached == null) {
    const raw =
      typeof window !== "undefined" ? localStorage.getItem(KEY) : null
    const n = raw ? Number(raw) : NaN
    cached = Number.isInteger(n) ? n : DEFAULT
  }
  return cached
}

export function getYear(): number {
  return read()
}

export function setYear(year: number): void {
  cached = year
  if (typeof window !== "undefined") localStorage.setItem(KEY, String(year))
  listeners.forEach((l) => l())
}

function subscribe(l: () => void): () => void {
  listeners.add(l)
  return () => listeners.delete(l)
}

/** Reactive accessor — components re-render and SWR refetches on change. */
export function useYear(): number {
  return useSyncExternalStore(subscribe, getYear, () => DEFAULT)
}
