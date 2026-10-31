"use client"

import { cn } from "@/lib/utils"
import type { HoldingResult, Lot } from "@/lib/savings/types"
import { sellableWithoutLoss, yearOf } from "@/lib/savings/compute"
import { Panel } from "@/components/stats/panel"
import { kr, up } from "@/components/stats/display"
import { formatUnits, monthLabel } from "@/components/savings/format"
import { PlanTimeline } from "@/components/savings/plan-timeline"

/** Per share plan: when each purchase's bonus arrives and what can be sold without losing bonus. */
export function PlanSchedule({
  result,
  todayIndex,
}: {
  result: HoldingResult
  todayIndex: number
}) {
  const { holding, lots, price } = result
  const buys = lots.filter((l) => l.source === "buy")
  const worth = (units: number) =>
    price === null ? "" : ` ≈ ${kr(units * price)}`
  const safeNow = sellableWithoutLoss(lots, todayIndex)
  const waiting = buys.filter(
    (l) => l.vestIndex !== null && l.vestIndex > todayIndex && l.held > 0,
  )
  const bonusDue = waiting.reduce((s, l) => s + l.bonusUnits, 0)

  const vestYears = [
    ...new Set(
      buys.flatMap((l) => (l.vestIndex !== null ? [yearOf(l.vestIndex)] : [])),
    ),
  ].sort()

  return (
    <Panel
      title={`${holding.name} · bonus schedule`}
      subtitle={`${holding.discount_pct}% discount · ${formatUnits(holding.bonus_ratio)} bonus share per share held ${holding.bonus_years} years · sales are first in, first out`}
    >
      <div className="flex flex-col gap-5">
        <div className="grid gap-4 sm:grid-cols-3">
          <Stat
            label="Can sell now without losing bonus"
            value={`${formatUnits(safeNow)} shares`}
            hint={worth(safeNow).replace(" ≈ ", "≈ ")}
          />
          <Stat
            label="Waiting for bonus"
            value={`${formatUnits(waiting.reduce((s, l) => s + l.held, 0))} shares`}
            hint={
              waiting.length
                ? `from ${waiting.length} purchase${waiting.length === 1 ? "" : "s"}`
                : "Nothing waiting"
            }
          />
          <Stat
            label="Bonus shares still to come"
            value={`+${formatUnits(bonusDue)}`}
            hint={worth(bonusDue).replace(" ≈ ", "≈ ")}
            tone={bonusDue > 0 ? up : undefined}
          />
        </div>

        <div className="flex flex-col gap-2">
          <h3 className="text-muted-foreground text-[11px] font-semibold tracking-widest uppercase">
            Timeline · when you bought and when you can sell
          </h3>
          <PlanTimeline lots={lots} todayIndex={todayIndex} />
        </div>

        {vestYears.length > 0 && (
          <div className="flex flex-col gap-2">
            <h3 className="text-muted-foreground text-[11px] font-semibold tracking-widest uppercase">
              Year by year
            </h3>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {vestYears.map((y) => (
                <YearCard
                  key={y}
                  year={y}
                  buys={buys}
                  lots={lots}
                  todayIndex={todayIndex}
                  worth={worth}
                />
              ))}
            </div>
          </div>
        )}

        {buys.length > 0 && (
          <div className="flex flex-col gap-2">
            <h3 className="text-muted-foreground text-[11px] font-semibold tracking-widest uppercase">
              Purchases
            </h3>
            <div className="overflow-x-auto border">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="bg-muted text-muted-foreground border-b text-left text-[11px] tracking-wider uppercase">
                    <th className="px-3 py-2 font-medium">Bought</th>
                    <th className="px-3 py-2 text-right font-medium">Shares</th>
                    <th className="px-3 py-2 text-right font-medium">Paid</th>
                    <th className="px-3 py-2 text-right font-medium">
                      Still held
                    </th>
                    <th className="px-3 py-2 font-medium">Bonus date</th>
                    <th className="px-3 py-2 text-right font-medium">Bonus</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {buys.map((l) => (
                    <tr key={l.monthIndex}>
                      <td className="px-3 py-2">{monthLabel(l.monthIndex)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatUnits(l.bought)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {kr(l.paid)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatUnits(l.held)}
                      </td>
                      <td className="px-3 py-2">
                        {l.vestIndex !== null ? monthLabel(l.vestIndex) : "–"}
                      </td>
                      <td
                        className={cn(
                          "px-3 py-2 text-right tabular-nums",
                          l.bonusUnits > 0 && up,
                        )}
                      >
                        {l.bonusUnits > 0
                          ? `+${formatUnits(l.bonusUnits)}`
                          : "–"}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {status(l, todayIndex)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </Panel>
  )
}

function status(l: Lot, todayIndex: number): string {
  const lost =
    l.forfeited > 0
      ? ` · bonus lost on ${formatUnits(l.forfeited)} sold early`
      : ""
  if (l.vestIndex === null) {
    return ""
  }
  if (l.vestIndex <= todayIndex) {
    return (
      (l.bonusUnits > 0 ? "Bonus received" : "No bonus (sold before)") + lost
    )
  }
  const left = l.vestIndex - todayIndex
  const wait =
    left >= 12 ? `${Math.floor(left / 12)} y ${left % 12} mo` : `${left} mo`
  return (l.held > 0 ? `Bonus in ${wait}` : "Sold — no bonus") + lost
}

function YearCard({
  year,
  buys,
  lots,
  todayIndex,
  worth,
}: {
  year: number
  buys: Lot[]
  lots: Lot[]
  todayIndex: number
  worth: (units: number) => string
}) {
  const vesting = buys.filter(
    (l) => l.vestIndex !== null && yearOf(l.vestIndex) === year,
  )
  const past = year < yearOf(todayIndex)
  return (
    <div
      className={cn("flex flex-col gap-1.5 border p-3", past && "opacity-60")}
    >
      <span className="text-lg font-semibold tabular-nums">{year}</span>
      {vesting.map((l) => {
        const at = l.vestIndex ?? 0
        const sellable = sellableWithoutLoss(lots, at)
        return (
          <div key={l.monthIndex} className="flex flex-col gap-0.5 text-xs">
            <span>
              <span className="font-medium">{monthLabel(at)}:</span>{" "}
              {monthLabel(l.monthIndex)} purchase unlocks
            </span>
            <span className="text-muted-foreground">
              {formatUnits(l.held)} shares
              {l.bonusUnits > 0 && (
                <span className={up}> + {formatUnits(l.bonusUnits)} bonus</span>
              )}
            </span>
            <span className="text-muted-foreground">
              From then:{" "}
              <span className="text-foreground font-medium">
                {formatUnits(sellable)}
              </span>{" "}
              sellable without losing bonus{worth(sellable)}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function Stat({
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
      <span className="text-muted-foreground text-[11px] font-semibold tracking-widest uppercase">
        {label}
      </span>
      <span className={cn("text-xl font-semibold tabular-nums", tone)}>
        {value}
      </span>
      {hint && <span className="text-muted-foreground text-xs">{hint}</span>}
    </div>
  )
}
