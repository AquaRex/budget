"use client"

import { useState } from "react"
import Link from "next/link"
import { Landmark, Loader2, RefreshCw } from "lucide-react"
import { toast } from "sonner"

import { runBankFetch, useBankUsage } from "@/lib/bank"
import { useDemoMode } from "@/lib/demo-mode"
import { errMessage } from "@/lib/errors"
import { Button } from "@/components/ui/button"

/**
 * Pulls new bank data on demand (never automatically), at most
 * BANK_DAILY_LIMIT times per day. Stage 1: data goes to the staging tables only.
 */
export function BankUpdateButton() {
  const { used, limit, connected, loaded } = useBankUsage()
  const demo = useDemoMode()
  const [busy, setBusy] = useState(false)

  if (!loaded) return null

  if (!connected) {
    return (
      <Button variant="outline" asChild>
        <Link href="/settings/bank" title="Connect your bank">
          <Landmark className="size-4" />
          Connect bank
        </Link>
      </Button>
    )
  }

  const left = limit - used
  const disabled = busy || left <= 0 || demo !== "off"

  async function onClick() {
    setBusy(true)
    try {
      const r = await runBankFetch()
      const fresh = r.accounts.reduce((n, a) => n + (a.new ?? 0), 0)
      const failed = r.accounts.filter((a) => a.error).length
      const msg = `Bank update: ${fresh} new raw transaction${fresh === 1 ? "" : "s"} in staging`
      if (failed) {
        toast.warning(
          `${msg} — ${failed} account(s) failed, see Settings → Bank`,
        )
      } else {
        toast.success(msg)
      }
    } catch (e) {
      toast.error(errMessage(e, "Bank update failed."))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        onClick={onClick}
        disabled={disabled}
        title={
          demo !== "off"
            ? "Turn off demo mode to update"
            : left <= 0
              ? "Daily limit reached — try again tomorrow"
              : "Pull new transactions from your bank (into staging)"
        }
      >
        {busy ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <RefreshCw className="size-4" />
        )}
        Update from bank
      </Button>
      <span
        className="text-muted-foreground text-xs leading-tight whitespace-nowrap tabular-nums"
        title={`Max ${limit} bank updates per day (the bank's own limit).`}
      >
        {used}/{limit} today
      </span>
    </div>
  )
}
