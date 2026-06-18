"use client"

import { useMemo } from "react"
import useSWR from "swr"

import { fetchEntries, fetchAmounts } from "@/lib/data/entries"
import { fetchCategories } from "@/lib/data/categories"
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
  const { data, error, isLoading, mutate } = useSWR<Entry[]>(
    ["entries", kind],
    () => fetchEntries(kind),
  )
  return { entries: data ?? [], error, isLoading, mutate }
}

export function useAmounts() {
  const { data, error, isLoading, mutate } = useSWR<EntryAmount[]>(
    "amounts",
    fetchAmounts,
  )
  return { amounts: data ?? [], error, isLoading, mutate }
}

export function useCategories(kind: EntryKind) {
  const { data, error, isLoading, mutate } = useSWR<Category[]>(
    ["categories", kind],
    () => fetchCategories(kind),
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
  const { data, error, isLoading, mutate } = useSWR<SalaryProfile | null>(
    "salary",
    fetchSalaryProfile,
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
