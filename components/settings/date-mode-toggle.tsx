"use client"

import { setDateMode, useDateMode, type DateMode } from "@/lib/date-mode"
import { cn } from "@/lib/utils"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

const OPTIONS: { value: DateMode; label: string; hint: string }[] = [
  {
    value: "bought",
    label: "Date bought",
    hint: "When you paid — the card timestamp",
  },
  {
    value: "booked",
    label: "Date booked",
    hint: "When the bank settled it",
  },
]

export function DateModeToggle() {
  const mode = useDateMode()
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-muted-foreground text-sm font-medium">
          Transaction date
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 sm:flex-row">
        {OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => setDateMode(o.value)}
            className={cn(
              "flex-1 rounded-lg border px-3 py-2 text-left transition-colors",
              mode === o.value
                ? "border-primary bg-muted"
                : "hover:bg-muted/60",
            )}
          >
            <div className="text-sm font-medium">{o.label}</div>
            <div className="text-muted-foreground text-xs">{o.hint}</div>
          </button>
        ))}
      </CardContent>
    </Card>
  )
}
