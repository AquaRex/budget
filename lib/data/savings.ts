"use client"

import useSWR from "swr"

import { getSupabase } from "@/lib/supabase/client"
import type { Holding, HoldingKind, Price, Trade, TradeSide } from "@/lib/savings/types"

const num = <T extends Record<string, unknown>>(row: T, keys: (keyof T)[]): T => {
  const out = { ...row }
  for (const k of keys) {
    out[k] = Number(row[k]) as T[keyof T]
  }
  return out
}

export async function fetchHoldings(): Promise<Holding[]> {
  const { data, error } = await getSupabase()
    .from("holdings")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true })
  if (error) {
    throw error
  }
  return (data ?? []).map((h) => num(h as Holding, ["discount_pct", "bonus_years", "bonus_ratio"]))
}

// Paged past PostgREST's 1000-row cap.
async function fetchAll<T>(table: string): Promise<T[]> {
  const PAGE = 1000
  const out: T[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await getSupabase()
      .from(table)
      .select("*")
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) {
      throw error
    }
    out.push(...((data ?? []) as T[]))
    if ((data ?? []).length < PAGE) {
      return out
    }
  }
}

export async function fetchTrades(): Promise<Trade[]> {
  return (await fetchAll<Trade>("holding_trades")).map((t) => num(t, ["units", "amount"]))
}

export async function fetchPrices(): Promise<Price[]> {
  return (await fetchAll<Price>("holding_prices")).map((p) => num(p, ["price"]))
}

export type HoldingInput = {
  name: string
  kind: HoldingKind
  discount_pct: number
  bonus_years: number
  bonus_ratio: number
  symbol: string | null
}

export async function createHolding(input: HoldingInput, sortOrder: number): Promise<void> {
  const { error } = await getSupabase()
    .from("holdings")
    .insert({ ...input, sort_order: sortOrder })
  if (error) {
    throw error
  }
}

export async function updateHolding(id: string, input: HoldingInput): Promise<void> {
  const { error } = await getSupabase().from("holdings").update(input).eq("id", id)
  if (error) {
    throw error
  }
}

/** Deletes the holding with all its trades and prices. */
export async function deleteHolding(id: string): Promise<void> {
  const { error } = await getSupabase().from("holdings").delete().eq("id", id)
  if (error) {
    throw error
  }
}

/** Set (or with null, remove) a holding's buy or sell for a month. */
export async function setTrade(
  holdingId: string,
  year: number,
  month: number,
  side: TradeSide,
  trade: { units: number; amount: number } | null,
): Promise<void> {
  const supabase = getSupabase()
  if (!trade) {
    const { error } = await supabase
      .from("holding_trades")
      .delete()
      .match({ holding_id: holdingId, year, month, side })
    if (error) {
      throw error
    }
    return
  }
  const { error } = await supabase
    .from("holding_trades")
    .upsert(
      { holding_id: holdingId, year, month, side, ...trade },
      { onConflict: "holding_id,year,month,side" },
    )
  if (error) {
    throw error
  }
}

/** Set (or with null, remove) a holding's price per unit for a month. */
export async function setPrice(
  holdingId: string,
  year: number,
  month: number,
  price: number | null,
): Promise<void> {
  const supabase = getSupabase()
  if (price === null) {
    const { error } = await supabase
      .from("holding_prices")
      .delete()
      .match({ holding_id: holdingId, year, month })
    if (error) {
      throw error
    }
    return
  }
  const { error } = await supabase
    .from("holding_prices")
    .upsert(
      { holding_id: holdingId, year, month, price },
      { onConflict: "holding_id,year,month" },
    )
  if (error) {
    throw error
  }
}

export function useSavings() {
  const holdings = useSWR("holdings", fetchHoldings)
  const trades = useSWR("holding_trades", fetchTrades)
  const prices = useSWR("holding_prices", fetchPrices)
  return {
    holdings: holdings.data ?? [],
    trades: trades.data ?? [],
    prices: prices.data ?? [],
    isLoading: holdings.isLoading || trades.isLoading || prices.isLoading,
    error: holdings.error ?? trades.error ?? prices.error,
    mutate: () => {
      holdings.mutate()
      trades.mutate()
      prices.mutate()
    },
  }
}
