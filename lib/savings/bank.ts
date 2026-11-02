"use client"

import useSWR from "swr"

import type { Category, Transaction } from "@/lib/types"
import { effectiveCategoryId, effectiveDate, type TypeMap } from "@/lib/spending"
import { fetchPriceAt } from "@/lib/savings/market"
import { monthIndexOf } from "@/lib/savings/compute"
import type { Holding, Price, Trade } from "@/lib/savings/types"

// Holdings paid from a budget category: each payment out in it (or in any
// category of it, when it's a group) buys the holding's share of the payment
// on the day it was paid, at that day's market price, or, for holdings priced
// by hand, the price entered for that month (or the latest one before it).

export type BankBuy = { holding: Holding; date: string; amount: number }

export function bankBuys(
  holdings: Holding[],
  transactions: Transaction[],
  categories: Category[],
  typeMap: TypeMap,
): BankBuy[] {
  const linked = holdings.filter((h) => h.category_id && h.kind !== "plan")
  if (!linked.length) {
    return []
  }
  const groupOf = new Map(categories.map((c) => [c.id, c.group_id]))
  const out: BankBuy[] = []
  for (const t of transactions) {
    const amount = -Number(t.amount)
    if (t.is_excluded || amount <= 0) {
      continue
    }
    const cat = effectiveCategoryId(t, typeMap)
    if (!cat) {
      continue
    }
    for (const h of linked) {
      if (cat === h.category_id || groupOf.get(cat) === h.category_id) {
        out.push({ holding: h, date: effectiveDate(t), amount: (amount * h.category_share_pct) / 100 })
      }
    }
  }
  return out
}

const priceKey = (symbol: string, date: string) => `${symbol}|${date}`
const CACHE = "price-at:"

function cached(key: string): number | null {
  try {
    const v = localStorage.getItem(CACHE + key)
    return v === null ? null : Number(v)
  } catch {
    return null
  }
}

function remember(key: string, price: number) {
  try {
    localStorage.setItem(CACHE + key, String(price))
  } catch {}
}

/** Market price in NOK on each linked holding's payment days; past days are kept in the browser. */
export function useBankPrices(buys: BankBuy[], today: string) {
  const keys = [
    ...new Set(buys.flatMap((b) => (b.holding.symbol ? [priceKey(b.holding.symbol, b.date)] : []))),
  ].sort()
  const { data, error, isLoading } = useSWR(
    keys.length ? ["bank-prices", ...keys] : null,
    async () => {
      const out = new Map<string, number>()
      const missing: string[] = []
      for (const k of keys) {
        const hit = k.slice(k.indexOf("|") + 1) < today ? cached(k) : null
        if (hit === null) {
          missing.push(k)
        } else {
          out.set(k, hit)
        }
      }
      for (let i = 0; i < missing.length; i += 4) {
        await Promise.all(
          missing.slice(i, i + 4).map(async (k) => {
            const [symbol, date] = k.split("|")
            const { price } = await fetchPriceAt(symbol, date, null)
            out.set(k, price)
            if (date < today) {
              remember(k, price)
            }
          }),
        )
      }
      return out
    },
    { revalidateOnFocus: false, dedupingInterval: 60 * 60 * 1000 },
  )
  return { prices: data, error: error as Error | undefined, isLoading }
}

/**
 * Bank buys as one buy per holding and month, added to any buy entered by
 * hand that month. Buys with no price yet are counted per holding instead.
 */
export function withBankBuys(
  trades: Trade[],
  buys: BankBuy[],
  marketAt: Map<string, number> | undefined,
  entered: Price[],
): { trades: Trade[]; unpriced: Map<string, number> } {
  const unpriced = new Map<string, number>()
  const monthly = new Map<string, Trade>()
  for (const b of buys) {
    const h = b.holding
    const year = Number(b.date.slice(0, 4))
    const month = Number(b.date.slice(5, 7))
    const price = h.symbol ? marketAt?.get(priceKey(h.symbol, b.date)) : enteredPrice(entered, h.id, monthIndexOf(year, month))
    if (!price) {
      unpriced.set(h.id, (unpriced.get(h.id) ?? 0) + 1)
      continue
    }
    const key = `${h.id}|${year}|${month}`
    const t = monthly.get(key) ?? {
      id: `bank-${key}`,
      holding_id: h.id,
      year,
      month,
      side: "buy" as const,
      units: 0,
      amount: 0,
      trade_date: b.date,
      trade_time: null,
      bank: 0,
    }
    t.units += b.amount / price
    t.amount += b.amount
    t.bank! += b.amount
    t.trade_date = b.date > t.trade_date! ? b.date : t.trade_date
    monthly.set(key, t)
  }
  const out = trades.map((t) => {
    const bank = t.side === "buy" ? monthly.get(`${t.holding_id}|${t.year}|${t.month}`) : undefined
    if (!bank) {
      return t
    }
    monthly.delete(`${t.holding_id}|${t.year}|${t.month}`)
    return { ...t, units: t.units + bank.units, amount: t.amount + bank.amount, bank: bank.bank }
  })
  return { trades: [...out, ...monthly.values()], unpriced }
}

/** The price entered by hand for a month, or the latest one before it. */
function enteredPrice(prices: Price[], holdingId: string, monthIndex: number): number | undefined {
  let best: { i: number; price: number } | undefined
  for (const p of prices) {
    const i = monthIndexOf(p.year, p.month)
    if (p.holding_id === holdingId && !p.market && i <= monthIndex && (!best || i > best.i)) {
      best = { i, price: p.price }
    }
  }
  return best?.price
}
