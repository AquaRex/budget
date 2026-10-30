"use client"

import { useMemo, useState } from "react"
import { toast } from "sonner"

import { MONTHS_LONG } from "@/lib/budget"
import type { Holding, Price, Trade } from "@/lib/savings/types"
import {
  computeHolding,
  impliedPrice,
  monthIndexOf,
  sellableWithoutLoss,
} from "@/lib/savings/compute"
import { setTrade } from "@/lib/data/savings"
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
import { formatPrice, formatUnits, parseNumber } from "@/components/savings/format"
import { kr } from "@/components/stats/display"

export type TradeTarget = { holding: Holding; year: number; month: number }

/** Edit a holding's buy and sell for one month. */
export function TradeDialog({
  target,
  trades,
  prices,
  onClose,
  onSaved,
}: {
  target: TradeTarget | null
  trades: Trade[]
  prices: Price[]
  onClose: () => void
  onSaved: () => void
}) {
  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        {target && (
          <TradeForm
            key={`${target.holding.id}-${target.year}-${target.month}`}
            target={target}
            trades={trades}
            prices={prices}
            onClose={onClose}
            onSaved={onSaved}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

const draft = (n: number | undefined) => (n === undefined ? "" : String(Number(n.toFixed(4))))

function TradeForm({
  target,
  trades,
  prices,
  onClose,
  onSaved,
}: {
  target: TradeTarget
  trades: Trade[]
  prices: Price[]
  onClose: () => void
  onSaved: () => void
}) {
  const { holding, year, month } = target
  const isPlan = holding.kind === "plan"
  const discount = isPlan ? holding.discount_pct / 100 : 0
  const at = (t: Trade) => t.holding_id === holding.id && t.year === year && t.month === month
  const buy = trades.find((t) => at(t) && t.side === "buy")
  const sell = trades.find((t) => at(t) && t.side === "sell")

  const [buyUnits, setBuyUnits] = useState(draft(buy?.units))
  // A new amount re-derives the units from the month's price unless you typed units here.
  const [unitsTouched, setUnitsTouched] = useState(false)
  // Plans: enter the market price, the discounted amount follows. Others: the amount paid.
  const [buyPrice, setBuyPrice] = useState(draft(buy ? impliedPrice(holding, buy) : undefined))
  const [buyAmount, setBuyAmount] = useState(draft(buy?.amount))
  const [sellUnits, setSellUnits] = useState(draft(sell?.units))
  const [sellAmount, setSellAmount] = useState(draft(sell?.amount))
  const [saving, setSaving] = useState(false)

  // This month's price (entered beats market) fills in what you leave blank.
  const monthPrice = (market: boolean) =>
    prices.find(
      (p) => p.holding_id === holding.id && p.year === year && p.month === month && !!p.market === market,
    )?.price
  const knownPrice = monthPrice(false) ?? monthPrice(true) ?? null

  const bp = parseNumber(buyPrice) ?? knownPrice
  const typedUnits = parseNumber(buyUnits)
  const typedAmount = parseNumber(buyAmount)
  const bu = isPlan
    ? typedUnits
    : (typedUnits ?? (typedAmount && knownPrice ? typedAmount / knownPrice : null))
  const ba = isPlan ? (bu !== null && bp !== null ? bu * bp * (1 - discount) : null) : typedAmount
  const su = parseNumber(sellUnits)
  const sa = parseNumber(sellAmount)
  const buyValid = (!typedUnits && !typedAmount) || (!!bu && ba !== null)
  const sellValid = !su || sa !== null

  // What a plan sale this month can take without losing bonus (FIFO).
  const safe = useMemo(() => {
    if (!isPlan) {
      return null
    }
    const i = monthIndexOf(year, month)
    const others = trades.filter((t) => !(at(t) && t.side === "sell"))
    const r = computeHolding(holding, others, prices, i)
    return sellableWithoutLoss(r.lots, i)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlan, holding, trades, prices, year, month])

  async function save() {
    setSaving(true)
    try {
      await setTrade(holding.id, year, month, "buy", bu ? { units: bu, amount: ba ?? 0 } : null)
      await setTrade(holding.id, year, month, "sell", su ? { units: su, amount: sa ?? 0 } : null)
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
        <DialogTitle>
          {holding.name} · {MONTHS_LONG[month - 1]} {year}
        </DialogTitle>
        <DialogDescription>
          Clear the fields to remove a buy or sell.
        </DialogDescription>
      </DialogHeader>

      <section className="flex flex-col gap-3">
        <h3 className="text-xs font-semibold tracking-widest uppercase">Bought</h3>
        {isPlan ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="buy-units">Shares</Label>
              <Input
                id="buy-units"
                autoFocus
                inputMode="decimal"
                value={buyUnits}
                onChange={(e) => setBuyUnits(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="buy-price">Market price per share</Label>
              <Input
                id="buy-price"
                inputMode="decimal"
                value={buyPrice}
                placeholder={knownPrice !== null ? formatUnits(knownPrice) : undefined}
                onChange={(e) => setBuyPrice(e.target.value)}
              />
            </div>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="buy-amount">Amount paid (kr)</Label>
              <Input
                id="buy-amount"
                autoFocus
                inputMode="decimal"
                value={buyAmount}
                onChange={(e) => {
                  setBuyAmount(e.target.value)
                  if (!unitsTouched && knownPrice !== null) {
                    setBuyUnits("")
                  }
                }}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="buy-units">Units</Label>
              <Input
                id="buy-units"
                inputMode="decimal"
                value={buyUnits}
                onInput={() => setUnitsTouched(true)}
                placeholder={
                  typedAmount && knownPrice ? formatUnits(typedAmount / knownPrice) : knownPrice ? "worked out from price" : undefined
                }
                onChange={(e) => setBuyUnits(e.target.value)}
              />
            </div>
          </div>
        )}
        {!isPlan && knownPrice === null && typedAmount && !typedUnits && (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            No price known for this month — enter the units from your statement.
          </p>
        )}
        {bu && ba !== null && (
          <p className="text-muted-foreground text-xs">
            {isPlan
              ? `You pay ${kr(ba)} (${holding.discount_pct}% below ${kr(bu * (bp ?? 0))} market value). Bonus: ${formatUnits(bu * holding.bonus_ratio)} shares in ${MONTHS_LONG[month - 1]} ${year + holding.bonus_years} if you still hold them.`
              : `${formatUnits(bu)} units at ${formatPrice(ba / bu)} per unit${typedUnits ? "" : ` (${MONTHS_LONG[month - 1]}'s price — adjust the units to match your statement)`}.`}
          </p>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="text-xs font-semibold tracking-widest uppercase">Sold</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sell-units">{isPlan ? "Shares" : "Units"}</Label>
            <Input
              id="sell-units"
              inputMode="decimal"
              value={sellUnits}
              onChange={(e) => setSellUnits(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sell-amount">Amount received (kr)</Label>
            <Input
              id="sell-amount"
              inputMode="decimal"
              value={sellAmount}
              onChange={(e) => setSellAmount(e.target.value)}
            />
          </div>
        </div>
        {safe !== null && (
          <p
            className={
              su && su > safe
                ? "text-xs font-medium text-amber-600 dark:text-amber-400"
                : "text-muted-foreground text-xs"
            }
          >
            {formatUnits(safe)} shares can be sold this month without losing bonus.
            {su && su > safe
              ? ` Selling ${formatUnits(su)} reaches shares still waiting for their bonus — that bonus is lost.`
              : ""}
          </p>
        )}
      </section>

      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={save} disabled={!buyValid || !sellValid || saving}>
          Save
        </Button>
      </DialogFooter>
    </>
  )
}
