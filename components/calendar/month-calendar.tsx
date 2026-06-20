"use client"

import { formatNOK, formatNumber } from "@/lib/format"
import { cn } from "@/lib/utils"
import { MONTHS_LONG } from "@/lib/budget"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

export type CalEvent = {
  day: number // 1-31
  name: string
  amount: number // magnitude
  kind: "bill" | "income"
}

export function MonthCalendar({
  open,
  onOpenChange,
  year,
  month, // 1-12
  events,
  subtitle,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  year: number
  month: number
  events: CalEvent[]
  subtitle?: string
}) {
  const daysInMonth = new Date(year, month, 0).getDate()
  const lead = (new Date(year, month - 1, 1).getDay() + 6) % 7 // Monday-first

  const byDay = new Map<number, CalEvent[]>()
  for (const e of events) {
    const d = Math.min(Math.max(e.day, 1), daysInMonth)
    const list = byDay.get(d) ?? []
    list.push(e)
    byDay.set(d, list)
  }

  const cells: (number | null)[] = []
  for (let i = 0; i < lead; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)

  const net = events.reduce(
    (s, e) => s + (e.kind === "income" ? e.amount : -e.amount),
    0,
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {MONTHS_LONG[month - 1]} {year}
          </DialogTitle>
          <DialogDescription>
            {subtitle ? `${subtitle} · ` : ""}
            Net {formatNOK(net)} across {events.length} item
            {events.length === 1 ? "" : "s"}.
          </DialogDescription>
        </DialogHeader>

        <div className="bg-border grid grid-cols-7 gap-px overflow-hidden rounded-lg border text-xs">
          {WEEKDAYS.map((w) => (
            <div
              key={w}
              className="bg-muted text-muted-foreground px-1 py-1 text-center font-medium"
            >
              {w}
            </div>
          ))}
          {cells.map((d, i) => (
            <div
              key={i}
              className={cn(
                "bg-background min-h-16 p-1 align-top",
                d == null && "bg-muted/30",
              )}
            >
              {d != null && (
                <>
                  <div className="text-muted-foreground mb-0.5 text-[10px]">
                    {d}
                  </div>
                  <div className="flex flex-col gap-0.5">
                    {(byDay.get(d) ?? []).map((e, j) => (
                      <div
                        key={j}
                        title={`${e.name}: ${formatNOK(e.amount)}`}
                        className={cn(
                          "truncate rounded px-1 py-0.5 text-[10px] leading-tight tabular-nums",
                          e.kind === "income"
                            ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                            : "bg-rose-500/10 text-rose-700 dark:text-rose-300",
                        )}
                      >
                        {formatNumber(e.amount)} {e.name}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
