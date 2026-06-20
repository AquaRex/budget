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
    const list = byDay.get(d)
    if (list) list.push(e)
    else byDay.set(d, [e])
  }

  const cells: (number | null)[] = []
  for (let i = 0; i < lead; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)
  const weeks = cells.length / 7

  const net = events.reduce(
    (s, e) => s + (e.kind === "income" ? e.amount : -e.amount),
    0,
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[100dvh] max-h-[100dvh] w-screen max-w-none flex-col gap-3 rounded-none sm:max-w-none">
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

        <div
          className="bg-border grid min-h-0 flex-1 grid-cols-7 gap-px overflow-hidden rounded-lg border text-xs"
          style={{ gridTemplateRows: `auto repeat(${weeks}, minmax(0, 1fr))` }}
        >
          {WEEKDAYS.map((w) => (
            <div
              key={w}
              className="bg-muted text-muted-foreground px-1 py-1.5 text-center font-medium"
            >
              {w}
            </div>
          ))}
          {cells.map((d, i) => (
            <div
              key={i}
              className={cn(
                "bg-background flex min-h-0 flex-col gap-1 overflow-y-auto p-1",
                d == null && "bg-muted/30",
              )}
            >
              {d != null && (
                <>
                  <div className="text-muted-foreground text-[11px] font-medium">
                    {d}
                  </div>
                  {(byDay.get(d) ?? []).map((e, j) => {
                    const income = e.kind === "income"
                    return (
                      <div
                        key={j}
                        title={`${e.name}: ${formatNOK(e.amount)}`}
                        className={cn(
                          "border-l-2 pl-1.5",
                          income
                            ? "border-emerald-500/50"
                            : "border-rose-500/50",
                        )}
                      >
                        <div
                          className={cn(
                            "text-sm font-semibold tabular-nums",
                            income
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-rose-600 dark:text-rose-400",
                          )}
                        >
                          {income ? "+" : "−"}
                          {formatNumber(e.amount)}
                        </div>
                        <div className="text-muted-foreground truncate text-[11px] leading-tight">
                          {e.name}
                        </div>
                      </div>
                    )
                  })}
                </>
              )}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
