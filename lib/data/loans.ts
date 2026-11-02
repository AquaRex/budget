"use client"

import useSWR from "swr"

import { getSupabase } from "@/lib/supabase/client"

export type Loan = {
  id: string
  name: string
  category_id: string | null
  balance: number // owed at the start of start_year/start_month
  interest_pct: number // nominal yearly rate
  start_year: number
  start_month: number
  monthly_payment: number | null // projected payment; null = recent average
  sort_order: number
}

export type LoanInput = Omit<Loan, "id" | "sort_order">

export async function fetchLoans(): Promise<Loan[]> {
  const { data, error } = await getSupabase()
    .from("loans")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true })
  if (error) {
    throw error
  }
  return (data ?? []).map((l) => ({
    ...(l as Loan),
    balance: Number(l.balance),
    interest_pct: Number(l.interest_pct),
    monthly_payment:
      l.monthly_payment === null ? null : Number(l.monthly_payment),
  }))
}

export async function createLoan(
  input: LoanInput,
  sortOrder: number,
): Promise<void> {
  const { error } = await getSupabase()
    .from("loans")
    .insert({ ...input, sort_order: sortOrder })
  if (error) {
    throw error
  }
}

export async function updateLoan(id: string, input: LoanInput): Promise<void> {
  const { error } = await getSupabase().from("loans").update(input).eq("id", id)
  if (error) {
    throw error
  }
}

export async function deleteLoan(id: string): Promise<void> {
  const { error } = await getSupabase().from("loans").delete().eq("id", id)
  if (error) {
    throw error
  }
}

export function useLoans() {
  const { data, error, isLoading, mutate } = useSWR("loans", fetchLoans)
  return { loans: data ?? [], error, isLoading, mutate }
}
