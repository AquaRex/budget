// Whether to date a transaction by when it was *bought* (the card timestamp,
// "Transaksjonstidspunkt") or when the bank *booked* it ("Bokført"). Weekend
// purchases book on the next business day, so "bought" matches real experience.
// Stored client-side (single user); changing it remounts the app subtree.
import { useSyncExternalStore } from "react"

export type DateMode = "bought" | "booked"

const KEY = "budget.dateMode"
let cached: DateMode | null = null
const listeners = new Set<() => void>()

function read(): DateMode {
  if (cached == null) {
    cached =
      typeof window !== "undefined" && localStorage.getItem(KEY) === "booked"
        ? "booked"
        : "bought"
  }
  return cached
}

export function getDateMode(): DateMode {
  return read()
}

export function setDateMode(mode: DateMode): void {
  cached = mode
  if (typeof window !== "undefined") localStorage.setItem(KEY, mode)
  listeners.forEach((l) => l())
}

function subscribe(l: () => void): () => void {
  listeners.add(l)
  return () => listeners.delete(l)
}

/** Reactive accessor for components (re-renders when the mode changes). */
export function useDateMode(): DateMode {
  return useSyncExternalStore(subscribe, getDateMode, () => "bought")
}
