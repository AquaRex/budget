"use client"

import type { MerchantStat } from "@/lib/stats/types"
import { kr } from "@/components/stats/display"

export function TopMerchants({
  merchants,
  limit = 8,
}: {
  merchants: MerchantStat[]
  limit?: number
}) {
  if (merchants.length === 0) {
    return (
      <p className="text-muted-foreground py-8 text-center text-sm">
        No merchants in this period.
      </p>
    )
  }
  const shown = merchants.slice(0, limit)
  const max = Math.max(...shown.map((m) => m.amount), 1)

  return (
    <ol className="flex flex-col gap-2.5">
      {shown.map((m, i) => (
        <li
          key={m.name}
          className="grid grid-cols-[1.25rem_minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1"
        >
          <span className="text-muted-foreground text-xs tabular-nums">
            {i + 1}
          </span>
          <span className="truncate text-sm font-medium capitalize">
            {m.name}
          </span>
          <span className="text-sm font-semibold tabular-nums">
            {kr(m.amount)}
          </span>
          <span />
          <div className="bg-muted relative h-1.5">
            <div
              className="bg-foreground/70 absolute inset-y-0 left-0 transition-[width] duration-700 ease-out motion-reduce:transition-none"
              style={{ width: `${(m.amount / max) * 100}%` }}
            />
          </div>
          <span className="text-muted-foreground text-right text-[11px] tabular-nums">
            {m.txCount}×
          </span>
        </li>
      ))}
    </ol>
  )
}
