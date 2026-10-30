export type HoldingKind = "fund" | "stock" | "plan"

export type Holding = {
  id: string
  name: string
  kind: HoldingKind
  discount_pct: number // plan: % below market paid on purchase
  bonus_years: number // plan: bonus shares arrive this many years after purchase
  bonus_ratio: number // plan: bonus shares per share still held at that point
  sort_order: number
  symbol: string | null // market ticker; null = prices entered by hand
}

export type TradeSide = "buy" | "sell"

export type Trade = {
  id: string
  holding_id: string
  year: number
  month: number // 1-12
  side: TradeSide
  units: number
  amount: number // NOK paid (buy) or received (sell)
}

export type Price = {
  id: string
  holding_id: string
  year: number
  month: number
  price: number // per unit, NOK
  market?: boolean // fetched market close; a price entered by hand wins over it
}

// One purchase (or bonus grant) still tracked FIFO.
export type Lot = {
  holdingId: string
  source: "buy" | "bonus"
  monthIndex: number // year * 12 + month - 1
  bought: number // units at acquisition
  held: number // units still held now
  paid: number // NOK paid (0 for bonus)
  // Plan purchases only:
  vestIndex: number | null // month the bonus arrives
  bonusUnits: number // bonus received (once vested) or still due if held
  forfeited: number // units sold before vesting, their bonus lost
}

export type HoldingMonth = {
  monthIndex: number
  units: number
  price: number | null // entered, market close, implied by that month's buy, or last known
  explicitPrice: boolean // entered by hand
  marketPrice: boolean // the market close for this month
  value: number // units × price (cost basis while no price is known)
  paid: number // cumulative NOK paid
  received: number // cumulative NOK received from sales
}

export type HoldingResult = {
  holding: Holding
  months: HoldingMonth[] // first trade month .. horizon, consecutive
  lots: Lot[] // every purchase and bonus grant, oldest first
  units: number
  price: number | null
  value: number
  paid: number
  received: number
  gain: number // value + received − paid
}

export type SavingsSeriesPoint = {
  monthIndex: number
  paid: number
  received: number
  invested: number // paid − received
  value: number
  gain: number
}
