"use client"

import { useState } from "react"
import { toast } from "sonner"

import type { Holding, HoldingKind } from "@/lib/savings/types"
import { createHolding, updateHolding, type HoldingInput } from "@/lib/data/savings"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { KIND_LABEL, parseNumber } from "@/components/savings/format"
import { QuoteSearch } from "@/components/savings/quote-search"
import { cn } from "@/lib/utils"

const KINDS: { kind: HoldingKind; hint: string }[] = [
  { kind: "fund", hint: "Index or mutual fund, bought in units" },
  { kind: "stock", hint: "Shares bought at market price" },
  { kind: "plan", hint: "Employee shares: discount + bonus shares" },
]

/** Add a holding (holding = null) or edit one. */
export function HoldingDialog({
  open,
  holding,
  nextSortOrder,
  onClose,
  onSaved,
}: {
  open: boolean
  holding: Holding | null
  nextSortOrder: number
  onClose: () => void
  onSaved: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        {open && (
          <HoldingForm
            holding={holding}
            nextSortOrder={nextSortOrder}
            onClose={onClose}
            onSaved={onSaved}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function HoldingForm({
  holding,
  nextSortOrder,
  onClose,
  onSaved,
}: {
  holding: Holding | null
  nextSortOrder: number
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState(holding?.name ?? "")
  const [kind, setKind] = useState<HoldingKind>(holding?.kind ?? "fund")
  const [discount, setDiscount] = useState(String(holding?.discount_pct ?? 20))
  const [years, setYears] = useState(String(holding?.bonus_years ?? 3))
  const [ratio, setRatio] = useState(String(holding?.bonus_ratio ?? 1))
  const [symbol, setSymbol] = useState<string | null>(holding?.symbol ?? null)
  const [searching, setSearching] = useState(!holding)
  const [saving, setSaving] = useState(false)

  const isPlan = kind === "plan"
  const input: HoldingInput | null = (() => {
    const d = isPlan ? parseNumber(discount) : 0
    const y = isPlan ? parseNumber(years) : 3
    const r = isPlan ? parseNumber(ratio) : 1
    if (!name.trim() || d === null || d >= 100 || y === null || y < 1 || y > 10 || r === null) {
      return null
    }
    return { name: name.trim(), kind, discount_pct: d, bonus_years: Math.round(y), bonus_ratio: r, symbol }
  })()

  async function save() {
    if (!input) {
      return
    }
    setSaving(true)
    try {
      if (holding) {
        await updateHolding(holding.id, input)
      } else {
        await createHolding(input, nextSortOrder)
      }
      onSaved()
      onClose()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{holding ? `Edit ${holding.name}` : "Add a holding"}</DialogTitle>
        <DialogDescription>
          A fund, stock or employee share plan you put money into.
        </DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label>Market link</Label>
          {searching ? (
            <>
              <QuoteSearch
                selected={symbol}
                onPick={(q) => {
                  setSymbol(q.symbol)
                  setName(q.name)
                  if (q.type !== "EQUITY") {
                    setKind("fund")
                  } else if (kind === "fund") {
                    setKind("stock")
                  }
                  setSearching(false)
                }}
              />
              <p className="text-muted-foreground text-xs">
                Linked holdings follow the market price every month. Not listed (e.g. a
                pension account)? Just fill in the name below and enter prices by hand.
              </p>
            </>
          ) : (
            <div className="flex flex-wrap items-center gap-2 border px-3 py-2 text-sm">
              <span className="min-w-0 flex-1 truncate">
                {symbol ? (
                  <>
                    Follows <span className="font-medium">{symbol}</span>
                  </>
                ) : (
                  <span className="text-muted-foreground">Not linked — prices by hand</span>
                )}
              </span>
              <Button size="sm" variant="ghost" onClick={() => setSearching(true)}>
                {symbol ? "Change" : "Link to a stock or fund"}
              </Button>
              {symbol && (
                <Button size="sm" variant="ghost" onClick={() => setSymbol(null)}>
                  Unlink
                </Button>
              )}
            </div>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="holding-name">Name</Label>
          <Input
            id="holding-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. KLP AksjeGlobal, Company shares"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Type</Label>
          <div className="grid gap-2 sm:grid-cols-3" role="radiogroup">
            {KINDS.map((k) => (
              <button
                key={k.kind}
                type="button"
                role="radio"
                aria-checked={kind === k.kind}
                onClick={() => setKind(k.kind)}
                className={cn(
                  "flex flex-col gap-0.5 border p-2.5 text-left transition-colors",
                  kind === k.kind ? "border-primary bg-primary/10" : "hover:bg-muted",
                )}
              >
                <span className="text-sm font-medium">{KIND_LABEL[k.kind]}</span>
                <span className="text-muted-foreground text-xs">{k.hint}</span>
              </button>
            ))}
          </div>
        </div>
        {isPlan && (
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="plan-discount">Discount %</Label>
              <Input
                id="plan-discount"
                inputMode="decimal"
                value={discount}
                onChange={(e) => setDiscount(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="plan-years">Bonus after (years)</Label>
              <Input
                id="plan-years"
                inputMode="numeric"
                value={years}
                onChange={(e) => setYears(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="plan-ratio">Bonus per share</Label>
              <Input
                id="plan-ratio"
                inputMode="decimal"
                value={ratio}
                onChange={(e) => setRatio(e.target.value)}
              />
            </div>
            <p className="text-muted-foreground text-xs sm:col-span-3">
              Each purchase earns {ratio || "?"} bonus share(s) per share still held{" "}
              {years || "?"} years later. Sales take the oldest shares first (FIFO); selling
              shares before their bonus date loses the bonus on them.
            </p>
          </div>
        )}
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={save} disabled={!input || saving}>
          {holding ? "Save" : "Add holding"}
        </Button>
      </DialogFooter>
    </>
  )
}
