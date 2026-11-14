"use client"

import { useState } from "react"
import { Check, Pencil, X } from "lucide-react"
import { toast } from "sonner"
import useSWR from "swr"

import { type AccountBalance, fetchBankBalances } from "@/lib/bank-balances"
import { saveAccountName, useAccountLabel } from "@/lib/data/accounts"
import { errMessage } from "@/lib/errors"
import { formatNOK } from "@/lib/format"
import { accountFromKey } from "@/lib/reconcile"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Panel } from "@/components/stats/panel"
import { PaymentCards } from "@/components/dashboard/payment-cards"

export function useBankBalances() {
  return useSWR("bank_balances", fetchBankBalances, {
    revalidateOnFocus: false,
  })
}

/** Account balances (left) and payment cards (right). */
export function BankBalances() {
  const { data } = useBankBalances()
  if (!data?.accounts.length) return null
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <AccountsPanel accounts={data.accounts} asOf={data.asOf} />
      <PaymentCards accounts={data.accounts} />
    </div>
  )
}

/**
 * What's really in each account right now: the bank's booked balance minus
 * purchases still pending, from the latest bank pull.
 */
function AccountsPanel({
  accounts,
  asOf,
}: {
  accounts: AccountBalance[]
  asOf: string | null
}) {
  const nok = accounts.filter((a) => a.currency === "NOK" && a.real !== null)
  const total = nok.reduce((s, a) => s + (a.real ?? 0), 0)
  const pendingTotal = nok.reduce((s, a) => s + a.pending, 0)

  return (
    <Panel
      title="In your accounts"
      subtitle={
        asOf
          ? `From the bank ${new Date(asOf).toLocaleString("nb-NO", {
              day: "2-digit",
              month: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            })} · pending purchases already subtracted`
          : undefined
      }
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline gap-x-3">
          <span className="text-3xl font-semibold tabular-nums">
            {formatNOK(total, true)}
          </span>
          {pendingTotal !== 0 && (
            <span className="text-muted-foreground text-xs tabular-nums">
              incl. {formatNOK(pendingTotal, true)} pending
            </span>
          )}
        </div>
        <div className="flex flex-col">
          {accounts.map((a) => (
            <AccountRow key={a.accountKey} a={a} />
          ))}
        </div>
      </div>
    </Panel>
  )
}

function AccountRow({ a }: { a: AccountBalance }) {
  const label = useAccountLabel()
  const acct = accountFromKey(a.accountKey)
  const name = label(acct)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState("")
  const money = (n: number) =>
    a.currency === "NOK" ? formatNOK(n, true) : `${n.toFixed(2)} ${a.currency}`

  async function save() {
    try {
      await saveAccountName(acct, draft)
      setEditing(false)
    } catch (e) {
      toast.error(errMessage(e, "Could not save the name."))
    }
  }

  return (
    <div className="border-t py-2 text-sm">
      <div className="flex items-center gap-2">
        {editing ? (
          <form
            className="flex flex-1 items-center gap-1"
            onSubmit={(e) => {
              e.preventDefault()
              save()
            }}
          >
            <Input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Account name"
              className="h-7"
              maxLength={60}
            />
            <Button
              type="submit"
              size="icon-sm"
              variant="ghost"
              aria-label="Save"
            >
              <Check className="size-4" />
            </Button>
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label="Cancel"
              onClick={() => setEditing(false)}
            >
              <X className="size-4" />
            </Button>
          </form>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setOpen(!open)}
              className="min-w-0 flex-1 text-left"
            >
              <div className="truncate font-medium">
                {name ?? `Account …${acct.slice(-4)}`}
              </div>
              <div className="text-muted-foreground text-xs tabular-nums">
                {acct.replace(/^(\d{4})(\d{2})(\d{5})$/, "$1.$2.$3")}
              </div>
            </button>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Rename account"
              onClick={() => {
                setDraft(name ?? "")
                setEditing(true)
              }}
            >
              <Pencil className="size-3.5" />
            </Button>
            <span
              className={cn(
                "shrink-0 font-semibold tabular-nums",
                (a.real ?? 0) < 0 && "text-destructive",
              )}
            >
              {a.real === null ? "—" : money(a.real)}
            </span>
          </>
        )}
      </div>
      {open && !editing && (
        <div className="text-muted-foreground mt-1 flex flex-col gap-0.5 text-xs tabular-nums">
          {a.error && <span className="text-destructive">{a.error}</span>}
          {a.basis === "booked-minus-pending" && (
            <>
              <Line
                k={`Booked balance (${a.bookedType})`}
                v={money(a.booked!)}
              />
              <Line k={`Pending (${a.pendingCount})`} v={money(a.pending)} />
              <Line k="Real" v={a.real === null ? "—" : money(a.real)} strong />
            </>
          )}
          {a.basis === "bank-available" && (
            <span>
              The bank only sent an available balance ({a.availableType}), which
              normally already includes pending purchases — shown as is.
            </span>
          )}
          {a.available !== null && a.basis === "booked-minus-pending" && (
            <Line
              k={`Bank's own "available" (${a.availableType}), for comparison`}
              v={money(a.available)}
            />
          )}
          {a.all.length > 0 && (
            <span className="mt-1">
              All sent:{" "}
              {a.all.map((b) => `${b.type} ${money(b.amount)}`).join(" · ")}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

function Line({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div
      className={cn(
        "flex justify-between gap-2",
        strong && "text-foreground font-medium",
      )}
    >
      <span>{k}</span>
      <span>{v}</span>
    </div>
  )
}
