"use client"

import Link from "next/link"
import { ArrowUpRight } from "lucide-react"

import type { DayStat } from "@/lib/stats/types"
import { dayTransactions } from "@/lib/stats/flows"
import { useStatsData } from "@/lib/stats/use-dashboard-stats"
import { deriveStem } from "@/lib/spending"
import { cn } from "@/lib/utils"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  flowLabel,
  formatLongDate,
  kr,
  signedKr,
  up,
} from "@/components/stats/display"

/** Day-to-day drill-down: every transaction on one date, linking to Spending. */
export function DaySheet({
  date,
  day,
  onOpenChange,
  side = "right",
}: {
  date: string | null
  day?: DayStat
  onOpenChange: (open: boolean) => void
  side?: "right" | "bottom"
}) {
  const { data } = useStatsData()
  const list = date ? dayTransactions(data, date) : []
  const period = date?.slice(0, 7) ?? ""

  return (
    <Sheet open={date != null} onOpenChange={onOpenChange}>
      <SheetContent
        side={side}
        className={cn(
          "gap-0",
          side === "bottom" && "max-h-[85dvh] pb-[env(safe-area-inset-bottom)]",
          side === "right" && "w-full sm:max-w-md",
        )}
      >
        <SheetHeader className="border-b p-5 pr-14">
          <SheetTitle className="text-base">
            {date ? formatLongDate(date) : ""}
          </SheetTitle>
          <SheetDescription className="flex gap-4 tabular-nums">
            <span>
              {(day?.spent ?? 0) < 0 ? "Net refund" : "Spent"}{" "}
              <span
                className={cn(
                  "font-semibold",
                  (day?.spent ?? 0) < 0 ? up : "text-foreground",
                )}
              >
                {kr(Math.abs(day?.spent ?? 0))}
              </span>
            </span>
            {(day?.income ?? 0) > 0 && (
              <span>
                Income{" "}
                <span className={cn("font-semibold", up)}>
                  {kr(day?.income ?? 0)}
                </span>
              </span>
            )}
          </SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto overscroll-contain">
          {list.length === 0 ? (
            <p className="text-muted-foreground p-8 text-center text-sm">
              No transactions this day.
            </p>
          ) : (
            <ul>
              {list.map((row) => {
                const t = row.tx
                const amount = Number(t.amount)
                const q = deriveStem(t.description) || t.type || ""
                const flow = flowLabel(row)
                return (
                  <li
                    key={t.id}
                    className={cn(
                      "border-b last:border-b-0",
                      !row.counted && "opacity-60",
                    )}
                  >
                    <Link
                      href={`/spending?tab=transactions&period=${period}&q=${encodeURIComponent(q)}`}
                      className="hover:bg-muted/60 active:bg-muted flex min-h-14 items-center gap-3 px-5 py-3 transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {t.description || t.type || "—"}
                        </p>
                        <p className="text-muted-foreground truncate text-xs">
                          {[flow, t.tx_at?.slice(11, 16), t.type]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      </div>
                      <span
                        className={cn(
                          "text-sm font-semibold tabular-nums",
                          !row.counted
                            ? "text-muted-foreground"
                            : row.flow === "income" || row.flow === "refund"
                              ? up
                              : "text-foreground",
                        )}
                      >
                        {signedKr(amount)}
                      </span>
                      <ArrowUpRight
                        className="text-muted-foreground size-4 shrink-0"
                        aria-hidden
                      />
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
