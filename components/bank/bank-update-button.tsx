"use client"

import { useState } from "react"
import Link from "next/link"
import { Landmark, Loader2, RefreshCw } from "lucide-react"
import { toast } from "sonner"

import { runBankFetch, useBankUsage } from "@/lib/bank"
import type { BankImportResult } from "@/lib/bank-import"
import { useDemoMode } from "@/lib/demo-mode"
import { errMessage } from "@/lib/errors"
import { Button } from "@/components/ui/button"

/** Toast for an import run (shared by the button and the automatic import). */
export function announceImport(r: BankImportResult, quietWhenNothing = false) {
  if (r.tooMany) {
    toast.warning(
      "The bank has an unusually large number of new transactions, so none were added automatically. Check Settings → Bank.",
    )
    return
  }
  const held = r.held
    ? ` ${r.held} need a quick review in Settings → Bank.`
    : ""
  if (r.added) {
    toast.success(
      `${r.added} new transaction${r.added === 1 ? "" : "s"} from the bank.${held}`,
    )
  } else if (held) {
    toast.info(held.trim())
  } else if (!quietWhenNothing) {
    toast.success("Up to date — no new transactions.")
  }
}

/**
 * Pulls from the bank now and adds what's new to the list. Max
 * BANK_DAILY_LIMIT per day; the daily automatic pull comes on top.
 */
export function BankUpdateButton() {
  const { used, limit, connected, loaded, lastAuto } = useBankUsage()
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
      const failed = r.accounts.filter((a) => a.error).length
      if (failed) {
        toast.warning(
          `${failed} account(s) could not be read — see Settings → Bank.`,
        )
      }
      announceImport(r.imported)
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
              : "Get the latest transactions from your bank now"
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
        className="text-muted-foreground text-xs leading-tight tabular-nums"
        title={`${limit} updates per day by the button, plus one automatic update every morning.`}
      >
        {used}/{limit} today
        {lastAuto && (
          <span className="block">
            auto{" "}
            {new Date(lastAuto).toLocaleString("nb-NO", {
              day: "2-digit",
              month: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        )}
      </span>
    </div>
  )
}
