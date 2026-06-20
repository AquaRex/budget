"use client"

import { Fragment, type ReactNode } from "react"

import { useDateMode } from "@/lib/date-mode"

/**
 * Remounts the app subtree when the bought/booked date mode changes, so every
 * memoised date computation recomputes without a full page reload.
 */
export function DateModeBoundary({ children }: { children: ReactNode }) {
  const mode = useDateMode()
  return <Fragment key={mode}>{children}</Fragment>
}
