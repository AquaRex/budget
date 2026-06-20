"use client"

import { useEffect, useState } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"

import { formatNOK, formatNumber } from "@/lib/format"
import { cn } from "@/lib/utils"
import { MONTHS_LONG } from "@/lib/budget"
import { Button } from "@/components/ui/button"
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
  /** When set (and onEventClick given), the box is a button that drills in. */
  merchant?: string
}

type Cursor = { y: number; m: number }
const step = (delta: number) => (c: Cursor): Cursor => {
  let m = c.m + delta
  let y = c.y
  if (m < 1) {
    m = 12
    y--
  } else if (m > 12) {
    m = 1
    y++
  }
  return { y, m }
}

export function MonthCalendar({
  open,
  onOpenChange,
  initialYear,
  initialMonth, // 1-12
  getEvents,
  subtitle,
  onEventClick,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialYear: number
  initialMonth: number
  getEvents: (year: number, month: number) => CalEvent[]
  subtitle?: string
  onEventClick?: (event: CalEvent, year: number, month: number) => void
}) {
  const [cursor, setCursor] = useState<Cursor>({
    y: initialYear,
    m: initialMonth,
  })

  // Reset to the clicked month each time the dialog opens (render-time sync).
  const openSig = open ? `${initialYear}-${initialMonth}` : "closed"
  const [lastSig, setLastSig] = useState(openSig)
  if (openSig !== lastSig) {
    setLastSig(openSig)
    if (open) setCursor({ y: initialYear, m: initialMonth })
  }

  // Arrow keys step months while the calendar is open.
  useEffect(() => {
    if (!open) return
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "ArrowLeft") {
        ev.preventDefault()
        setCursor(step(-1))
      } else if (ev.key === "ArrowRight") {
        ev.preventDefault()
        setCursor(step(1))
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open])

  const { y, m } = cursor
  const events = getEvents(y, m)

  const daysInMonth = new Date(y, m, 0).getDate()
  const lead = (new Date(y, m - 1, 1).getDay() + 6) % 7 // Monday-first
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
      <DialogContent className="flex h-[90vh] max-h-[90vh] w-[92vw] max-w-[1600px] flex-col gap-4 sm:max-w-[1600px]">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                aria-label="Previous month"
                onClick={() => setCursor(step(-1))}
              >
                <ChevronLeft className="size-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                aria-label="Next month"
                onClick={() => setCursor(step(1))}
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
            <div className="min-w-0">
              <DialogTitle>
                {MONTHS_LONG[m - 1]} {y}
              </DialogTitle>
              <DialogDescription>
                {subtitle ? `${subtitle} · ` : ""}
                Net {formatNOK(net)} across {events.length} item
                {events.length === 1 ? "" : "s"} · ←/→ to change month
              </DialogDescription>
            </div>
          </div>
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
                  {(byDay.get(d) ?? []).map((e, j) => (
                    <EventBox
                      key={j}
                      event={e}
                      onClick={
                        onEventClick && e.merchant
                          ? () => onEventClick(e, y, m)
                          : undefined
                      }
                    />
                  ))}
                </>
              )}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function EventBox({
  event: e,
  onClick,
}: {
  event: CalEvent
  onClick?: () => void
}) {
  const income = e.kind === "income"
  const cls = cn(
    "bg-muted/40 hover:bg-muted w-full rounded-md px-2 py-1 text-left transition-colors",
    onClick && "cursor-pointer",
  )
  const inner = (
    <>
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
    </>
  )
  const title = `${e.name}: ${formatNOK(e.amount)}`
  return onClick ? (
    <button type="button" onClick={onClick} title={title} className={cls}>
      {inner}
    </button>
  ) : (
    <div title={title} className={cls}>
      {inner}
    </div>
  )
}
