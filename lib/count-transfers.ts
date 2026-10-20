// Whether transfers between your own accounts count as spending (out) and
// income (in). Off by default: they're tracked but don't move the figures.
// Stored client-side (single user); changing it remounts the app subtree.
import { useSyncExternalStore } from "react"

const KEY = "budget.countTransfers"
let cached: boolean | null = null
const listeners = new Set<() => void>()

function read(): boolean {
  if (cached == null) {
    cached = typeof window !== "undefined" && localStorage.getItem(KEY) === "true"
  }
  return cached
}

export function getCountTransfers(): boolean {
  return read()
}

export function setCountTransfers(count: boolean): void {
  cached = count
  if (typeof window !== "undefined") {
    localStorage.setItem(KEY, String(count))
  }
  listeners.forEach((l) => l())
}

function subscribe(l: () => void): () => void {
  listeners.add(l)
  return () => listeners.delete(l)
}

/** Reactive accessor for components (re-renders when the setting changes). */
export function useCountTransfers(): boolean {
  return useSyncExternalStore(subscribe, getCountTransfers, () => false)
}
