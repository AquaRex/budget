"use client"

import { useState } from "react"
import useSWR from "swr"

import { type AccountBalance, fetchBankBalances } from "@/lib/bank-balances"
import { formatNOK } from "@/lib/format"
import { cn } from "@/lib/utils"
import { Panel } from "@/components/stats/panel"

/**
 * What's really in each account right now: the bank's booked balance minus
 * purchases still pending, from the latest bank pull. Click an account to see
 * exactly how the number is made up.
 */
export function BankBalances() {
  const { data } = useSWR("bank_balances", fetchBankBalances, {
    revalidateOnFocus: false,
  })
  if (!data?.accounts.length) return null

  const nok = data.accounts.filter(
    (a) => a.currency === "NOK" && a.real !== null,
  )
  const total = nok.reduce((s, a) => s + (a.real ?? 0), 0)
  const pendingTotal = nok.reduce((s, a) => s + a.pending, 0)

  return (
    <Panel
      title="In your accounts"
      subtitle={
        data.asOf
          ? `From the bank ${new Date(data.asOf).toLocaleString("nb-NO", {
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
        <div className="grid gap-x-6 sm:grid-cols-2 xl:grid-cols-4">
          {data.accounts.map((a) => (
            <AccountRow key={a.accountKey} a={a} />
          ))}
        </div>
      </div>
    </Panel>
  )
}

function AccountRow({ a }: { a: AccountBalance }) {
  const [open, setOpen] = useState(false)
  const money = (n: number) =>
    a.currency === "NOK" ? formatNOK(n, true) : `${n.toFixed(2)} ${a.currency}`
  return (
    <div className="border-t py-1.5 text-sm">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-baseline justify-between gap-2 text-left"
      >
        <span className="text-muted-foreground truncate">{a.label}</span>
        <span
          className={cn(
            "shrink-0 font-medium tabular-nums",
            (a.real ?? 0) < 0 && "text-destructive",
          )}
        >
          {a.real === null ? "—" : money(a.real)}
        </span>
      </button>
      {open && (
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
