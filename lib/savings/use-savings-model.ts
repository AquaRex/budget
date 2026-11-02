"use client"

import { useMemo } from "react"

import { useSavings } from "@/lib/data/savings"
import { useCategories, useTransactions, useTypeCategories } from "@/lib/data/use-budget"
import { buildTypeMap } from "@/lib/spending"
import { useMarketPrices } from "@/lib/savings/market"
import { bankBuys, useBankPrices, withBankBuys } from "@/lib/savings/bank"
import { useToday } from "@/lib/stats/use-dashboard-stats"
import { computeHolding, monthIndexOf, savingsSeries } from "@/lib/savings/compute"

/**
 * Every holding replayed to today (entered + market prices, plus buys from
 * payments in each holding's category), and the all-holdings monthly series.
 */
export function useSavingsModel() {
  const { holdings, trades: entered, prices: enteredPrices, isLoading, error, mutate } = useSavings()
  const { transactions, isLoading: transactionsLoading } = useTransactions()
  const { categories, isLoading: categoriesLoading } = useCategories()
  const { typeCategories, isLoading: typesLoading } = useTypeCategories()
  const market = useMarketPrices(holdings)
  const today = useToday()
  const todayIndex = monthIndexOf(Number(today.slice(0, 4)), Number(today.slice(5, 7)))
  const typeMap = useMemo(() => buildTypeMap(typeCategories), [typeCategories])
  const buys = useMemo(
    () => bankBuys(holdings, transactions, categories, typeMap),
    [holdings, transactions, categories, typeMap],
  )
  const bank = useBankPrices(buys, today)
  const { trades, unpriced } = useMemo(
    () => withBankBuys(entered, buys, bank.prices, enteredPrices),
    [entered, buys, bank.prices, enteredPrices],
  )
  const prices = useMemo(() => [...enteredPrices, ...market.prices], [enteredPrices, market.prices])
  const results = useMemo(
    () => holdings.map((h) => computeHolding(h, trades, prices, todayIndex)),
    [holdings, trades, prices, todayIndex],
  )
  const series = useMemo(() => savingsSeries(results, todayIndex), [results, todayIndex])
  return {
    holdings,
    categories,
    trades,
    enteredTrades: entered,
    unpriced,
    prices,
    results,
    series,
    todayIndex,
    isLoading: isLoading || transactionsLoading || categoriesLoading || typesLoading || bank.isLoading,
    error,
    mutate,
    marketLoading: market.isLoading,
    marketError: market.error ?? bank.error,
  }
}

export type SavingsModel = ReturnType<typeof useSavingsModel>
