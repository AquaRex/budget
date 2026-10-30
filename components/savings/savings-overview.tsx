"use client"

import { useState } from "react"

import { cn } from "@/lib/utils"
import type { SavingsModel } from "@/lib/savings/use-savings-model"
import { Panel } from "@/components/stats/panel"
import { down, kr, signedKr, signedPct, up } from "@/components/stats/display"
import { SavingsChart, holdingPoints } from "@/components/savings/savings-chart"

/** Headline numbers and worth vs money put in over time, all holdings or one. */
export function SavingsOverview({ model }: { model: SavingsModel }) {
  const { results, series, todayIndex } = model
  const [focus, setFocus] = useState<string | null>(null)

  const picked = results.find((r) => r.holding.id === focus)
  const points = picked ? holdingPoints(picked.months, todayIndex) : series
  const now = points.at(-1)
  const paid = now?.paid ?? 0
  const gain = now?.gain ?? 0
  const rate = paid > 0 ? gain / paid : null

  return (
    <Panel
      title="Savings & investments"
      subtitle={picked ? picked.holding.name : "All holdings"}
      action={
        results.length > 1 && (
          <div className="flex flex-wrap justify-end gap-1">
            {[null, ...results.map((r) => r.holding.id)].map((id) => (
              <button
                key={id ?? "all"}
                type="button"
                onClick={() => setFocus(id)}
                className={cn(
                  "border px-2 py-1 text-[11px] font-medium",
                  focus === id ? "bg-primary text-primary-foreground border-primary" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {id ? results.find((r) => r.holding.id === id)?.holding.name : "All"}
              </button>
            ))}
          </div>
        )
      }
    >
      <div className="flex flex-col gap-5">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Figure label="Worth now" value={kr(now?.value ?? 0)} />
          <Figure label="Put in (net)" value={kr(now?.invested ?? 0)} hint={now?.received ? `${kr(paid)} paid · ${kr(now.received)} taken out` : undefined} />
          <Figure
            label="Profit / loss"
            value={signedKr(gain)}
            tone={gain > 0 ? up : gain < 0 ? down : undefined}
          />
          <Figure
            label="Return"
            value={signedPct(rate)}
            tone={gain > 0 ? up : gain < 0 ? down : undefined}
            hint="On everything paid in"
          />
        </div>
        <SavingsChart points={points} />
        <p className="text-muted-foreground text-xs">
          Green = what it&apos;s worth, dashed = what you&apos;ve put in. The gap is your profit
          (bonus shares and the plan discount count as profit — they cost you nothing).
        </p>
      </div>
    </Panel>
  )
}

function Figure({
  label,
  value,
  hint,
  tone,
}: {
  label: string
  value: string
  hint?: string
  tone?: string
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-muted-foreground text-[11px] font-semibold tracking-widest uppercase">{label}</span>
      <span className={cn("text-2xl font-semibold tabular-nums", tone)}>{value}</span>
      {hint && <span className="text-muted-foreground text-xs">{hint}</span>}
    </div>
  )
}
