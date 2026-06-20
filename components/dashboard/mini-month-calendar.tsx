"use client"

import { formatNOK } from "@/lib/format"
import { cn } from "@/lib/utils"

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"]

export type MiniEvent = { day: number; amount: number; kind: "bill" | "income" }

export function MiniMonthCalendar({
  year,
  month, // 1-12
  events,
  onOpen,
}: {
  year: number
  month: number
  events: MiniEvent[]
  onOpen?: () => void
}) {
  const daysInMonth = new Date(year, month, 0).getDate()
  const lead = (new Date(year, month - 1, 1).getDay() + 6) % 7

  const outByDay = new Map<number, number>()
  for (const e of events) {
    if (e.kind !== "bill") continue
    outByDay.set(e.day, (outByDay.get(e.day) ?? 0) + e.amount)
  }
  const maxOut = Math.max(1, ...outByDay.values())

  const cells: (number | null)[] = []
  for (let i = 0; i < lead; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)

  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full text-left"
      title="Open full calendar"
    >
      <div className="grid grid-cols-7 gap-1">
        {WEEKDAYS.map((w, i) => (
          <div
            key={i}
            className="text-muted-foreground text-center text-[10px] font-medium"
          >
            {w}
          </div>
        ))}
        {cells.map((d, i) => {
          const out = d ? (outByDay.get(d) ?? 0) : 0
          const intensity = out > 0 ? 0.12 + (out / maxOut) * 0.45 : 0
          return (
            <div
              key={i}
              title={d && out > 0 ? `${d}: ${formatNOK(out)}` : undefined}
              className={cn(
                "flex aspect-square items-center justify-center rounded-sm text-[11px] tabular-nums",
                d == null && "opacity-0",
                out > 0 ? "text-foreground font-medium" : "text-muted-foreground",
              )}
              style={
                out > 0
                  ? { backgroundColor: `color-mix(in oklab, #f43f5e ${Math.round(intensity * 100)}%, transparent)` }
                  : undefined
              }
            >
              {d}
            </div>
          )
        })}
      </div>
    </button>
  )
}
