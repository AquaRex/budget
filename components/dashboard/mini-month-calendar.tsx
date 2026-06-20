"use client"

import { formatNOK, formatNumber } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { CalEvent } from "@/components/calendar/month-calendar"

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"]

export function MiniMonthCalendar({
  year,
  month, // 1-12
  events,
  onOpen,
}: {
  year: number
  month: number
  events: CalEvent[]
  onOpen?: () => void
}) {
  const daysInMonth = new Date(year, month, 0).getDate()
  const lead = (new Date(year, month - 1, 1).getDay() + 6) % 7

  const byDay = new Map<number, CalEvent[]>()
  for (const e of events) {
    const d = Math.min(Math.max(e.day, 1), daysInMonth)
    const list = byDay.get(d)
    if (list) list.push(e)
    else byDay.set(d, [e])
  }

  const cells: (number | null)[] = []
  for (let i = 0; i < lead; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)

  return (
    <div
      role={onOpen ? "button" : undefined}
      tabIndex={onOpen ? 0 : undefined}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (onOpen && (e.key === "Enter" || e.key === " ")) onOpen()
      }}
      className={cn("flex flex-col gap-1", onOpen && "cursor-pointer")}
      title={onOpen ? "Open full calendar" : undefined}
    >
      <div className="grid grid-cols-7 gap-px">
        {WEEKDAYS.map((w, i) => (
          <div
            key={i}
            className="text-muted-foreground text-center text-[9px] font-medium"
          >
            {w}
          </div>
        ))}
      </div>
      <div className="bg-border grid grid-cols-7 gap-px overflow-hidden rounded-sm border">
        {cells.map((d, i) => (
          <div
            key={i}
            className={cn(
              "bg-background min-h-11 p-0.5",
              d == null && "bg-muted/30",
            )}
          >
            {d != null && (
              <>
                <div className="text-muted-foreground text-[9px] leading-none">
                  {d}
                </div>
                <div className="mt-0.5 flex flex-col gap-px">
                  {(byDay.get(d) ?? []).map((e, j) => {
                    const income = e.kind === "income"
                    return (
                      <div
                        key={j}
                        title={`${e.name}: ${formatNOK(e.amount)}`}
                        className="truncate text-[9px] leading-tight"
                      >
                        <span
                          className={cn(
                            "font-medium tabular-nums",
                            income
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-rose-600 dark:text-rose-400",
                          )}
                        >
                          {income ? "+" : "−"}
                          {formatNumber(e.amount)}
                        </span>{" "}
                        <span className="text-muted-foreground">{e.name}</span>
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
