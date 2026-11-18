"use client"

// One year for the whole app. Every year control (the nav selector, the
// Transactions / Bills / Income steppers, the dashboard and the phone app) reads
// and writes the same global year and steps through the same list: the years
// that hold any data. Arrows never walk into empty years; an empty year (e.g.
// to enter stocks for it) is opened deliberately via "Go to year" in the nav.
import { useMemo } from "react"
import useSWR from "swr"

import { setYear, useYear } from "@/lib/year"
import { fetchTrades } from "@/lib/data/savings"
import { useBudgetYears, useTransactions } from "@/lib/data/use-budget"

export type YearContents = {
  budget: boolean
  transactions: number
  trades: boolean
}

/** The nearest year in `years` before (delta -1) or after (delta 1) `year`. */
export function adjacentYear(years: number[], year: number, delta: number): number | null {
  if (delta < 0) {
    for (let i = years.length - 1; i >= 0; i--) if (years[i] < year) return years[i]
  } else {
    for (const y of years) if (y > year) return y
  }
  return null
}

export function useYearNav() {
  const year = useYear()
  const { years: budgetYears } = useBudgetYears()
  const { transactions } = useTransactions()
  const { data: trades } = useSWR("holding_trades", fetchTrades)

  const contents = useMemo(() => {
    const map = new Map<number, YearContents>()
    const get = (y: number) => {
      let c = map.get(y)
      if (!c) map.set(y, (c = { budget: false, transactions: 0, trades: false }))
      return c
    }
    // The current year is always reachable, even before anything is entered.
    get(new Date().getFullYear())
    for (const y of budgetYears) get(y).budget = true
    for (const t of transactions) {
      const y = Number((t.tx_date ?? t.booked_date).slice(0, 4))
      if (Number.isFinite(y)) get(y).transactions++
    }
    for (const t of trades ?? []) get(t.year).trades = true
    return map
  }, [budgetYears, transactions, trades])

  const years = useMemo(() => Array.from(contents.keys()).sort((a, b) => a - b), [contents])
  const prevYear = adjacentYear(years, year, -1)
  const nextYear = adjacentYear(years, year, 1)

  return {
    year,
    /** Years with data (plus the current year), ascending. */
    years,
    contents,
    hasData: years.includes(year),
    prevYear,
    nextYear,
    /** Step to the adjacent year with data; returns false at either end. */
    step: (delta: number): boolean => {
      const target = delta < 0 ? prevYear : nextYear
      if (target == null) return false
      setYear(target)
      return true
    },
  }
}
