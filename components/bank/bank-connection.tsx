"use client"

import { useEffect, useRef, useState } from "react"
import { Loader2, Unplug } from "lucide-react"
import { toast } from "sonner"

import {
  accountLabel,
  type Aspsp,
  type BankSession,
  completeBankAuth,
  disconnectBank,
  isActiveSession,
  listBanks,
  refreshBankData,
  startBankAuth,
  useBankSessions,
} from "@/lib/bank"
import { useDemoMode } from "@/lib/demo-mode"
import { errMessage } from "@/lib/errors"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const DEFAULT_BANK = /sparebanken norge/i

function daysLeft(iso: string | null): number | null {
  if (!iso) return null
  return Math.floor((new Date(iso).getTime() - Date.now()) / 86_400_000)
}

/** Handles the redirect back from the bank (?code=…&state=…) exactly once. */
function useBankCallback() {
  const handled = useRef(false)
  useEffect(() => {
    if (handled.current) return
    handled.current = true
    const params = new URLSearchParams(window.location.search)
    const code = params.get("code")
    const state = params.get("state")
    const err = params.get("error")
    if (!code && !err) return
    // Remove the one-time code from the address bar straight away.
    window.history.replaceState(null, "", window.location.pathname)
    if (err) {
      toast.error(
        `The bank login was not completed: ${params.get("error_description") || err}`,
      )
      return
    }
    if (!state) {
      toast.error(
        "The bank redirect is missing its state. Start again with Connect.",
      )
      return
    }
    toast.promise(
      completeBankAuth(code!, state).then(async (r) => {
        await refreshBankData()
        return r
      }),
      {
        loading: "Finishing bank connection…",
        success: (r) => `Connected to ${r.bank} — ${r.accounts} account(s).`,
        error: (e) => errMessage(e, "Could not finish the bank connection."),
      },
    )
  }, [])
}

export function BankConnection() {
  useBankCallback()
  const { data: sessions, error } = useBankSessions()
  const demo = useDemoMode()
  const active = (sessions ?? []).filter(isActiveSession)

  if (error) {
    return (
      <p className="text-destructive text-sm">
        Could not load bank connections: {errMessage(error, "unknown error")}.
        Has migration 0027_bank_staging.sql been run?
      </p>
    )
  }
  if (!sessions) {
    return <Loader2 className="text-muted-foreground size-5 animate-spin" />
  }

  return (
    <div className="flex flex-col gap-4">
      {demo !== "off" && (
        <p className="text-sm text-amber-600">
          Demo mode is on — connecting and updating are disabled.
        </p>
      )}
      {active.map((s) => (
        <SessionCard key={s.id} session={s} />
      ))}
      <ConnectForm reconnect={active.length > 0} disabled={demo !== "off"} />
    </div>
  )
}

function SessionCard({ session }: { session: BankSession }) {
  const [busy, setBusy] = useState(false)
  const left = daysLeft(session.valid_until)

  async function onDisconnect() {
    if (
      !confirm(
        `Disconnect ${session.aspsp_name}? Raw data already pulled is kept.`,
      )
    )
      return
    setBusy(true)
    try {
      await disconnectBank(session.session_id)
      await refreshBankData()
      toast.success("Disconnected.")
    } catch (e) {
      toast.error(errMessage(e, "Could not disconnect."))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-3 border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">{session.aspsp_name}</span>
        <Badge
          variant={left !== null && left < 14 ? "destructive" : "secondary"}
        >
          {left === null
            ? "No expiry given"
            : `Consent valid ${left} more day${left === 1 ? "" : "s"}`}
        </Badge>
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto"
          onClick={onDisconnect}
          disabled={busy}
        >
          <Unplug className="size-4" />
          Disconnect
        </Button>
      </div>
      <ul className="text-sm">
        {session.accounts.map((a, i) => (
          <li
            key={a.uid ?? i}
            className="flex flex-wrap gap-x-3 border-t py-1.5"
          >
            <span className="font-medium">{accountLabel(a)}</span>
            <span className="text-muted-foreground tabular-nums">
              {a.account_id?.iban ?? "no IBAN"}
            </span>
            <span className="text-muted-foreground">
              {[a.cash_account_type, a.product, a.currency]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function ConnectForm({
  reconnect,
  disabled,
}: {
  reconnect: boolean
  disabled: boolean
}) {
  const [banks, setBanks] = useState<Aspsp[] | null>(null)
  const [picked, setPicked] = useState<string>("")
  const [busy, setBusy] = useState(false)

  async function loadBanks() {
    setBusy(true)
    try {
      const list = await listBanks()
      setBanks(list)
      setPicked(list.find((b) => DEFAULT_BANK.test(b.name))?.name ?? "")
    } catch (e) {
      toast.error(errMessage(e, "Could not load the list of banks."))
    } finally {
      setBusy(false)
    }
  }

  async function onConnect() {
    const bank = banks?.find((b) => b.name === picked)
    if (!bank) return
    setBusy(true)
    try {
      const { url } = await startBankAuth(bank)
      window.location.assign(url) // to the bank's BankID login
    } catch (e) {
      toast.error(errMessage(e, "Could not start the bank connection."))
      setBusy(false)
    }
  }

  if (!banks) {
    return (
      <div>
        <Button
          onClick={loadBanks}
          disabled={busy || disabled}
          variant={reconnect ? "outline" : "default"}
        >
          {busy && <Loader2 className="size-4 animate-spin" />}
          {reconnect ? "Renew consent…" : "Connect bank…"}
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={picked} onValueChange={setPicked}>
        <SelectTrigger className="w-72">
          <SelectValue placeholder="Choose your bank" />
        </SelectTrigger>
        <SelectContent>
          {banks.map((b) => (
            <SelectItem key={b.name} value={b.name}>
              {b.name}
              {b.beta ? " (beta)" : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button onClick={onConnect} disabled={!picked || busy || disabled}>
        {busy && <Loader2 className="size-4 animate-spin" />}
        Continue to BankID
      </Button>
    </div>
  )
}
