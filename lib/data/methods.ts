import { getSupabase } from "@/lib/supabase/client"
import type { PaymentMethod } from "@/lib/types"

export async function fetchMethods(): Promise<PaymentMethod[]> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from("payment_methods")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true })
  if (error) throw error
  return (data ?? []) as PaymentMethod[]
}

export async function createMethod(name: string): Promise<PaymentMethod> {
  const supabase = getSupabase()
  const { data: last } = await supabase
    .from("payment_methods")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
  const sort_order = (last?.[0]?.sort_order ?? -1) + 1
  const { data, error } = await supabase
    .from("payment_methods")
    .insert({ name: name.trim(), sort_order })
    .select("*")
    .single()
  if (error) throw error
  return data as PaymentMethod
}

export async function deleteMethod(id: string): Promise<void> {
  const supabase = getSupabase()
  const { error } = await supabase.from("payment_methods").delete().eq("id", id)
  if (error) throw error
}
