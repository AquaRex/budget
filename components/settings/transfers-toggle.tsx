"use client"

import { setCountTransfers, useCountTransfers } from "@/lib/count-transfers"
import { cn } from "@/lib/utils"
import { Panel } from "@/components/stats/panel"

const OPTIONS: { value: boolean; label: string; hint: string }[] = [
  {
    value: false,
    label: "Don't count transfers",
    hint: "Moves between your own accounts are tracked, not spending or income",
  },
  {
    value: true,
    label: "Count transfers",
    hint: "Transfers out count as spending, transfers in as income",
  },
]

export function TransfersToggle() {
  const count = useCountTransfers()
  return (
    <Panel
      title="Transfers between own accounts"
      subtitle="Whether moving money between your accounts counts"
    >
      <div className="flex flex-col gap-2 sm:flex-row">
        {OPTIONS.map((o) => (
          <button
            key={String(o.value)}
            type="button"
            onClick={() => setCountTransfers(o.value)}
            className={cn(
              "flex-1 border px-3 py-2 text-left transition-colors",
              count === o.value
                ? "border-primary bg-muted"
                : "hover:bg-muted/60",
            )}
          >
            <div className="text-sm font-medium">{o.label}</div>
            <div className="text-muted-foreground text-xs">{o.hint}</div>
          </button>
        ))}
      </div>
    </Panel>
  )
}
