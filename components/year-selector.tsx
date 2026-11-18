"use client"

import { useState } from "react"
import { Check, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react"

import { cn } from "@/lib/utils"
import { setYear } from "@/lib/year"
import { useYearNav, type YearContents } from "@/lib/data/use-year-nav"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"

function describe(c: YearContents | undefined): string {
  if (!c) return "No data yet"
  const parts: string[] = []
  if (c.transactions) parts.push(`${c.transactions.toLocaleString("nb-NO")} tx`)
  if (c.budget) parts.push("budget")
  if (c.trades) parts.push("stocks")
  return parts.length ? parts.join(" · ") : "No data yet"
}

/**
 * The one year control for the whole app: ‹ year ▾ ›. Arrows step between years
 * that have data (disabled at either end); the menu lists those years with what
 * each holds, and "Go to year" opens any other year (e.g. to enter stocks).
 */
export function YearSelector() {
  const { year, years, contents, hasData, prevYear, nextYear, step } = useYearNav()
  const [open, setOpen] = useState(false)
  const [other, setOther] = useState("")

  const goOther = () => {
    const y = Number(other)
    if (!Number.isInteger(y) || y < 2000 || y > 2100) return
    setYear(y)
    setOther("")
    setOpen(false)
  }

  const arrow =
    "text-muted-foreground hover:text-foreground hover:bg-secondary/60 flex size-8 items-center justify-center rounded-md disabled:pointer-events-none disabled:opacity-30"

  return (
    <div className="flex items-center gap-0.5">
      <button
        type="button"
        aria-label={prevYear ? `Previous year with data (${prevYear})` : "No earlier year with data"}
        title={prevYear ? String(prevYear) : undefined}
        onClick={() => step(-1)}
        disabled={prevYear == null}
        className={arrow}
      >
        <ChevronLeft className="size-4" />
      </button>

      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger
          className={cn(
            "hover:bg-secondary/60 flex items-center gap-1 rounded-md px-2.5 py-1 text-sm font-semibold tabular-nums",
            !hasData && "border-muted-foreground/50 border border-dashed",
          )}
          aria-label={`Year ${year}${hasData ? "" : ", no data yet"}. Choose year`}
        >
          {year}
          <ChevronDown className="text-muted-foreground size-3.5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuLabel className="text-muted-foreground text-[11px] tracking-widest uppercase">
            Years with data
          </DropdownMenuLabel>
          {[...years].reverse().map((y) => (
            <DropdownMenuItem
              key={y}
              onSelect={() => setYear(y)}
              className="flex items-center justify-between gap-3"
            >
              <span className="flex items-center gap-2 font-medium tabular-nums">
                <Check className={cn("size-3.5", y !== year && "invisible")} />
                {y}
              </span>
              <span className="text-muted-foreground text-xs">{describe(contents.get(y))}</span>
            </DropdownMenuItem>
          ))}
          {!hasData && (
            <DropdownMenuItem disabled className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 font-medium tabular-nums">
                <Check className="size-3.5" />
                {year}
              </span>
              <span className="text-xs">No data yet</span>
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <form
            className="flex items-center gap-1.5 p-1.5"
            onSubmit={(e) => {
              e.preventDefault()
              goOther()
            }}
            // Keep typing inside the menu from triggering its typeahead.
            onKeyDown={(e) => e.stopPropagation()}
          >
            <Input
              inputMode="numeric"
              placeholder="Go to year…"
              value={other}
              onChange={(e) => setOther(e.target.value.replace(/\D/g, "").slice(0, 4))}
              className="h-8"
              aria-label="Go to another year"
            />
            <button
              type="submit"
              className="bg-primary text-primary-foreground h-8 px-2.5 text-xs font-semibold disabled:opacity-40"
              disabled={other.length !== 4}
            >
              Go
            </button>
          </form>
          <p className="text-muted-foreground px-2 pb-1 text-[11px]">
            Open an empty year to add a budget or stocks for it.
          </p>
        </DropdownMenuContent>
      </DropdownMenu>

      <button
        type="button"
        aria-label={nextYear ? `Next year with data (${nextYear})` : "No later year with data"}
        title={nextYear ? String(nextYear) : undefined}
        onClick={() => step(1)}
        disabled={nextYear == null}
        className={arrow}
      >
        <ChevronRight className="size-4" />
      </button>
    </div>
  )
}
