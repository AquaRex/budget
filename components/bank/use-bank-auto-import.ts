"use client"

import { useEffect } from "react"

import { runBankImport } from "@/lib/bank-import"
import { getDemoMode } from "@/lib/demo-mode"
import { announceImport } from "@/components/bank/bank-update-button"

let ranThisLoad = false

/**
 * Once per page load: add anything the daily automatic bank pull brought in
 * (it already sits in the bank archive) to the transaction list. This does NOT
 * contact the bank — it only uses data already pulled. Silent if nothing's new.
 */
export function useBankAutoImport() {
  useEffect(() => {
    if (ranThisLoad || getDemoMode() !== "off") return
    ranThisLoad = true
    runBankImport()
      .then((r) => announceImport(r, true))
      .catch(() => {
        // No bank tables yet / not connected — nothing to do.
      })
  }, [])
}
