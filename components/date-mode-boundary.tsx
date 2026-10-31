"use client"

import { Fragment, type ReactNode } from "react"

import { useDateMode } from "@/lib/date-mode"
import { useCountTransfers } from "@/lib/count-transfers"
import { useDemoMode } from "@/lib/demo-mode"

/**
 * Remounts the app subtree when the bought/booked date mode, the "count
 * transfers" setting or demo mode changes, so every memoised computation recomputes without
 * a full page reload.
 */
export function DateModeBoundary({ children }: { children: ReactNode }) {
  const mode = useDateMode()
  const countTransfers = useCountTransfers()
  const demo = useDemoMode()
  return (
    <Fragment key={`${mode}:${countTransfers}:${demo}`}>{children}</Fragment>
  )
}
