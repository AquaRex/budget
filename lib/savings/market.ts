"use client"

import { useMemo } from "react"
import useSWR from "swr"

import { getSupabase } from "@/lib/supabase/client"
import type { Holding, Price } from "@/lib/savings/types"

export type QuoteResult = { symbol: string; name: string; type: string; exchange: string }

type HistoryPoint = { year: number; month: number; close: number }
export type MarketHistory = {
  symbol: string
  name: string
  currency: string | null
  price: number | null
  points: HistoryPoint[]
}

async function quotes<T>(body: Record<string, string>): Promise<T> {
  const { data, error } = await getSupabase().functions.invoke("quotes", { body })
  if (error) {
    throw error
  }
  if (data?.error) {
    throw new Error(data.error)
  }
  return data as T
}

export async function searchQuotes(q: string): Promise<QuoteResult[]> {
  return (await quotes<{ results: QuoteResult[] }>({ search: q })).results
}

export function fetchHistory(symbol: string): Promise<MarketHistory> {
  return quotes<MarketHistory>({ history: symbol })
}

export type PriceAt = {
  price: number // NOK per unit
  date: string // the trading day the price is from (a weekend gives Friday)
  time: string | null // set when it's an intraday price
}

/** Price per unit in NOK at a date (and optional HH:MM, exchange time). */
export async function fetchPriceAt(symbol: string, date: string, time: string | null): Promise<PriceAt> {
  type Quote = { currency: string | null; price: number; date: string; time: string | null }
  const q = await quotes<Quote>(time ? { quote: symbol, date, time } : { quote: symbol, date })
  const pence = q.currency === "GBp"
  const currency = pence ? "GBP" : q.currency
  if (!currency || currency === "NOK") {
    return { price: q.price, date: q.date, time: q.time }
  }
  const fx = await quotes<Quote>({ quote: `${currency}NOK=X`, date })
  return { price: (q.price * fx.price) / (pence ? 100 : 1), date: q.date, time: q.time }
}

const key = (year: number, month: number) => year * 12 + month - 1

/** Monthly closes in NOK: other currencies convert at that month's rate (GBp is pence). */
async function nokHistory(symbol: string): Promise<{ meta: MarketHistory; points: HistoryPoint[] }> {
  const meta = await fetchHistory(symbol)
  const pence = meta.currency === "GBp"
  const currency = pence ? "GBP" : meta.currency
  if (!currency || currency === "NOK") {
    return { meta, points: meta.points }
  }
  const fx = await fetchHistory(`${currency}NOK=X`)
  const rates = new Map(fx.points.map((p) => [key(p.year, p.month), p.close]))
  let last: number | null = null
  const points: HistoryPoint[] = []
  for (const p of meta.points) {
    last = rates.get(key(p.year, p.month)) ?? last
    if (last !== null) {
      points.push({ ...p, close: (p.close * last) / (pence ? 100 : 1) })
    }
  }
  return { meta, points }
}

/**
 * Market prices (NOK per unit, monthly) for every holding linked to a symbol.
 * Holdings without a symbol aren't fetched; their prices are entered by hand.
 */
export function useMarketPrices(holdings: Holding[]) {
  const symbols = [...new Set(holdings.flatMap((h) => (h.symbol ? [h.symbol] : [])))].sort()
  const { data, error, isLoading } = useSWR(
    symbols.length ? ["market", ...symbols] : null,
    async () => {
      const out = new Map<string, Awaited<ReturnType<typeof nokHistory>>>()
      for (const s of symbols) {
        out.set(s, await nokHistory(s))
      }
      return out
    },
    { revalidateOnFocus: false, dedupingInterval: 60 * 60 * 1000 },
  )
  const prices = useMemo(() => {
    const out: Price[] = []
    for (const h of holdings) {
      for (const p of (h.symbol && data?.get(h.symbol)?.points) || []) {
        out.push({
          id: `market-${h.id}-${p.year}-${p.month}`,
          holding_id: h.id,
          year: p.year,
          month: p.month,
          price: p.close,
          market: true,
        })
      }
    }
    return out
  }, [holdings, data])
  return { prices, history: data, error: error as Error | undefined, isLoading }
}
