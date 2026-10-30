"use client"

import { useMemo } from "react"

import { useSavings } from "@/lib/data/savings"
import { useMarketPrices } from "@/lib/savings/market"
import { useToday } from "@/lib/stats/use-dashboard-stats"
import { computeHolding, monthIndexOf, savingsSeries } from "@/lib/savings/compute"

/** Every holding replayed to today (entered + market prices), plus the all-holdings monthly series. */
export function useSavingsModel() {
  const { holdings, trades, prices: entered, isLoading, error, mutate } = useSavings()
  const market = useMarketPrices(holdings)
  const today = useToday()
  const todayIndex = monthIndexOf(Number(today.slice(0, 4)), Number(today.slice(5, 7)))
  const prices = useMemo(() => [...entered, ...market.prices], [entered, market.prices])
  const results = useMemo(
    () => holdings.map((h) => computeHolding(h, trades, prices, todayIndex)),
    [holdings, trades, prices, todayIndex],
  )
  const series = useMemo(() => savingsSeries(results, todayIndex), [results, todayIndex])
  return {
    holdings,
    trades,
    prices,
    results,
    series,
    todayIndex,
    isLoading,
    error,
    mutate,
    marketLoading: market.isLoading,
    marketError: market.error,
  }
}

export type SavingsModel = ReturnType<typeof useSavingsModel>
