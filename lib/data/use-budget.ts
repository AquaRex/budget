"use client"

import { useMemo } from "react"
import useSWR from "swr"

import { fetchEntries, fetchAmounts, fetchEntryYears } from "@/lib/data/entries"
import { fetchCategories } from "@/lib/data/categories"
import { useYear } from "@/lib/year"
import { fetchMethods } from "@/lib/data/methods"
import { fetchSalaryProfile } from "@/lib/data/salary"
import {
  fetchTransactions,
  fetchImports,
  fetchTxRules,
} from "@/lib/data/transactions"
import { fetchTypeCategories } from "@/lib/data/type-categories"
import { buildAmountMap, type BudgetContext } from "@/lib/budget"
import type { SalaryProfile } from "@/lib/salary"
import type {
  Category,
  Entry,
  EntryAmount,
  EntryKind,
  ImportBatch,
  PaymentMethod,
  Transaction,
  TxRule,
  TypeCategory,
} from "@/lib/types"

export function useEntries(kind: EntryKind) {
  const year = useYear()
  const { data, error, isLoading, mutate } = useSWR<Entry[]>(
    ["entries", kind, year],
    () => fetchEntries(kind, year),
  )
  return { entries: data ?? [], error, isLoading, mutate }
}

export function useAmounts() {
  const year = useYear()
  const { data, error, isLoading, mutate } = useSWR<EntryAmount[]>(
    ["amounts", year],
    () => fetchAmounts(year),
  )
  return { amounts: data ?? [], error, isLoading, mutate }
}

/** Distinct years that have budget entries (newest first), incl. current. */
export function useBudgetYears() {
  const { data, error, isLoading, mutate } = useSWR<number[]>(
    "entry_years",
    fetchEntryYears,
  )
  const years = new Set<number>(data ?? [])
  years.add(new Date().getFullYear())
  return {
    years: Array.from(years).sort((a, b) => a - b),
    error,
    isLoading,
    mutate,
  }
}

/**
 * Every year worth showing in the selector: years with a budget AND years that
 * only have imported transactions (so you can view a year's actuals before
 * building its budget). Newest first, always includes the current year.
 */
export function useAvailableYears(): number[] {
  const { years: budgetYears } = useBudgetYears()
  const { transactions } = useTransactions()
  const set = new Set<number>(budgetYears)
  set.add(new Date().getFullYear())
  for (const t of transactions) {
    const y = Number((t.tx_date ?? t.booked_date).slice(0, 4))
    if (Number.isFinite(y)) set.add(y)
  }
  return Array.from(set).sort((a, b) => a - b)
}

export function useCategories() {
  const { data, error, isLoading, mutate } = useSWR<Category[]>(
    "categories",
    fetchCategories,
  )
  return { categories: data ?? [], error, isLoading, mutate }
}

export function useMethods() {
  const { data, error, isLoading, mutate } = useSWR<PaymentMethod[]>(
    "methods",
    fetchMethods,
  )
  return { methods: data ?? [], error, isLoading, mutate }
}

export function useSalaryProfile() {
  const year = useYear()
  const { data, error, isLoading, mutate } = useSWR<SalaryProfile | null>(
    ["salary", year],
    () => fetchSalaryProfile(year),
  )
  return { profile: data ?? null, error, isLoading, mutate }
}

export function useTransactions() {
  const { data, error, isLoading, mutate } = useSWR<Transaction[]>(
    "transactions",
    fetchTransactions,
  )
  return { transactions: data ?? [], error, isLoading, mutate }
}

export function useImports() {
  const { data, error, isLoading, mutate } = useSWR<ImportBatch[]>(
    "imports",
    fetchImports,
  )
  return { imports: data ?? [], error, isLoading, mutate }
}

export function useTxRules() {
  const { data, error, isLoading, mutate } = useSWR<TxRule[]>(
    "tx_rules",
    fetchTxRules,
  )
  return { rules: data ?? [], error, isLoading, mutate }
}

export function useTypeCategories() {
  const { data, error, isLoading, mutate } = useSWR<TypeCategory[]>(
    "type_categories",
    fetchTypeCategories,
  )
  return { typeCategories: data ?? [], error, isLoading, mutate }
}

/** Build a BudgetContext from a live amounts array + the salary profile. */
export function useBudgetContext(
  amounts: EntryAmount[],
  salary: SalaryProfile | null,
): BudgetContext {
  return useMemo(
    () => ({ amounts: buildAmountMap(amounts), salary }),
    [amounts, salary],
  )
}
