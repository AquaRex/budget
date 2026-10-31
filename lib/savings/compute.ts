import type {
  Holding,
  HoldingMonth,
  HoldingResult,
  Lot,
  Price,
  SavingsSeriesPoint,
  Trade,
} from "@/lib/savings/types"

export const monthIndexOf = (year: number, month: number) => year * 12 + month - 1
export const yearOf = (index: number) => Math.floor(index / 12)
export const monthOf = (index: number) => (index % 12) + 1

/** Market price per unit implied by a purchase (plans pay below market). Last resort after entered and market prices. */
export function impliedPrice(holding: Holding, trade: Trade): number {
  const discount = holding.kind === "plan" ? holding.discount_pct / 100 : 0
  return trade.amount / trade.units / (1 - discount)
}

/**
 * Replays one holding month by month: bonus grants first, then buys, then
 * FIFO sells. A sale that reaches a plan purchase before its bonus arrives
 * forfeits the bonus on the units taken from it. Totals are as of `horizon`
 * (today's month).
 */
export function computeHolding(
  holding: Holding,
  trades: Trade[],
  prices: Price[],
  horizon: number,
): HoldingResult {
  const own = trades.filter((t) => t.holding_id === holding.id)
  const tradesAt = new Map<number, Trade[]>()
  for (const t of own) {
    const i = monthIndexOf(t.year, t.month)
    tradesAt.set(i, [...(tradesAt.get(i) ?? []), t])
  }
  const ownPrices = prices.filter((p) => p.holding_id === holding.id)
  const pricesAt = (market: boolean) =>
    new Map(
      ownPrices
        .filter((p) => !!p.market === market)
        .map((p) => [monthIndexOf(p.year, p.month), p.price]),
    )
  const manualAt = pricesAt(false)
  const marketAt = pricesAt(true)
  const isPlan = holding.kind === "plan"
  const lots: Lot[] = []
  const months: HoldingMonth[] = []
  // Market history reaches back decades; a holding starts at its first trade or entered price.
  const starts = [...tradesAt.keys(), ...manualAt.keys()]
  if (starts.length === 0) {
    return { holding, months, lots, units: 0, price: null, value: 0, paid: 0, received: 0, gain: 0 }
  }
  // Run past today to the last bonus date so future grants exist as lots.
  const vests = isPlan
    ? own.filter((t) => t.side === "buy").map((t) => monthIndexOf(t.year, t.month) + holding.bonus_years * 12)
    : []
  const first = Math.min(...starts)
  const last = Math.max(horizon, ...starts, ...vests)

  let paid = 0
  let received = 0
  let price: number | null = null
  for (let i = first; i <= last; i++) {
    for (const lot of lots) {
      if (lot.vestIndex === i && lot.held > 0) {
        lot.bonusUnits = lot.held * holding.bonus_ratio
        lots.push({
          holdingId: holding.id,
          source: "bonus",
          monthIndex: i,
          bought: lot.bonusUnits,
          held: lot.bonusUnits,
          paid: 0,
          vestIndex: null,
          bonusUnits: 0,
          forfeited: 0,
        })
      }
    }
    const here = tradesAt.get(i) ?? []
    const buy = here.find((t) => t.side === "buy")
    const sell = here.find((t) => t.side === "sell")
    if (buy) {
      paid += buy.amount
      lots.push({
        holdingId: holding.id,
        source: "buy",
        monthIndex: i,
        bought: buy.units,
        held: buy.units,
        paid: buy.amount,
        vestIndex: isPlan ? i + holding.bonus_years * 12 : null,
        bonusUnits: isPlan ? buy.units * holding.bonus_ratio : 0,
        forfeited: 0,
      })
    }
    if (sell) {
      received += sell.amount
      let left = sell.units
      for (const lot of lots) {
        if (left <= 0) {
          break
        }
        const take = Math.min(lot.held, left)
        if (take <= 0) {
          continue
        }
        lot.held -= take
        left -= take
        if (lot.vestIndex !== null && lot.vestIndex > i) {
          lot.forfeited += take
          lot.bonusUnits = lot.held * holding.bonus_ratio
        }
      }
    }
    const explicit = manualAt.get(i)
    const market = marketAt.get(i)
    if (explicit !== undefined) {
      price = explicit
    } else if (market !== undefined) {
      price = market
    } else if (buy) {
      price = impliedPrice(holding, buy)
    }
    const units = lots.reduce((s, l) => s + l.held, 0)
    const costBasis = lots.reduce((s, l) => s + (l.bought > 0 ? (l.paid * l.held) / l.bought : 0), 0)
    months.push({
      monthIndex: i,
      units,
      price,
      explicitPrice: explicit !== undefined,
      marketPrice: explicit === undefined && market !== undefined,
      value: price === null ? costBasis : units * price,
      paid,
      received,
    })
  }
  const end = months[months.length - 1]
  const lastToday = months.filter((m) => m.monthIndex <= horizon).at(-1) ?? end
  return {
    holding,
    months,
    lots,
    units: lastToday.units,
    price: lastToday.price,
    value: lastToday.value,
    paid: lastToday.paid,
    received: lastToday.received,
    gain: lastToday.value + lastToday.received - lastToday.paid,
  }
}

/** Every holding summed per month, from the first trade to `horizon`. */
export function savingsSeries(results: HoldingResult[], horizon: number): SavingsSeriesPoint[] {
  const starts = results.flatMap((r) => (r.months.length ? [r.months[0].monthIndex] : []))
  if (starts.length === 0) {
    return []
  }
  const out: SavingsSeriesPoint[] = []
  for (let i = Math.min(...starts); i <= horizon; i++) {
    let paid = 0
    let received = 0
    let value = 0
    for (const r of results) {
      const m = r.months.find((x) => x.monthIndex === i)
      if (m) {
        paid += m.paid
        received += m.received
        value += m.value
      }
    }
    out.push({ monthIndex: i, paid, received, invested: paid - received, value, gain: value + received - paid })
  }
  return out
}

/**
 * First month a lot can be sold without losing any bonus. FIFO sells every lot
 * queued before it first, so it waits for all of those purchases to vest.
 */
export function freeFrom(lots: Lot[], lot: Lot): number {
  let at = lot.monthIndex
  for (const l of lots.slice(0, lots.indexOf(lot) + 1)) {
    if (l.source === "buy" && l.vestIndex !== null && l.held > 0) {
      at = Math.max(at, l.vestIndex)
    }
  }
  return at
}

/**
 * Units of a plan that can be sold at `at` without losing any bonus: FIFO
 * takes oldest lots first, so it's everything held up to the first purchase
 * whose bonus hasn't arrived yet (bonus shares queue behind earlier buys).
 */
export function sellableWithoutLoss(lots: Lot[], at: number): number {
  let units = 0
  for (const lot of lots) {
    if (lot.monthIndex > at) {
      break
    }
    if (lot.source === "buy" && lot.vestIndex !== null && lot.vestIndex > at && lot.held > 0) {
      break
    }
    units += lot.held
  }
  return units
}
