"use client"

import useSWR from "swr"

import { getSupabase } from "@/lib/supabase/client"

export type Goal = {
  id: string
  name: string
  target_amount: number
  target_year: number
  target_month: number
  start_amount: number
  include_holdings: boolean
  sort_order: number
}

export type GoalInput = Omit<Goal, "id" | "sort_order">

export async function fetchGoals(): Promise<Goal[]> {
  const { data, error } = await getSupabase()
    .from("goals")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true })
  if (error) {
    throw error
  }
  return (data ?? []).map((g) => ({
    ...(g as Goal),
    target_amount: Number(g.target_amount),
    start_amount: Number(g.start_amount),
  }))
}

export async function createGoal(
  input: GoalInput,
  sortOrder: number,
): Promise<void> {
  const { error } = await getSupabase()
    .from("goals")
    .insert({ ...input, sort_order: sortOrder })
  if (error) {
    throw error
  }
}

export async function updateGoal(id: string, input: GoalInput): Promise<void> {
  const { error } = await getSupabase().from("goals").update(input).eq("id", id)
  if (error) {
    throw error
  }
}

export async function deleteGoal(id: string): Promise<void> {
  const { error } = await getSupabase().from("goals").delete().eq("id", id)
  if (error) {
    throw error
  }
}

export function useGoals() {
  const { data, error, isLoading, mutate } = useSWR<Goal[]>("goals", fetchGoals)
  return {
    goals: data ?? [],
    error: error as Error | undefined,
    isLoading,
    mutate,
  }
}
