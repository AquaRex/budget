"use client"

import { useMemo } from "react"
import useSWR from "swr"

import { fetchEntries, fetchAmounts } from "@/lib/data/entries"
import { fetchCategories } from "@/lib/data/categories"
import { fetchMethods } from "@/lib/data/methods"
import { fetchSalaryProfile } from "@/lib/data/salary"
import { buildAmountMap, type BudgetContext } from "@/lib/budget"
import type { SalaryProfile } from "@/lib/salary"
import type {
  Category,
  Entry,
  EntryAmount,
  EntryKind,
  PaymentMethod,
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
