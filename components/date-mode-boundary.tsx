"use client"

import { Fragment, type ReactNode } from "react"

import { useDateMode } from "@/lib/date-mode"
import { useCountTransfers } from "@/lib/count-transfers"

/**
 * Remounts the app subtree when the bought/booked date mode or the "count
 * transfers" setting changes, so every memoised computation recomputes without
 * a full page reload.
 */
export function DateModeBoundary({ children }: { children: ReactNode }) {
  const mode = useDateMode()
  const countTransfers = useCountTransfers()
  return <Fragment key={`${mode}:${countTransfers}`}>{children}</Fragment>
}
