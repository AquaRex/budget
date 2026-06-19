import { getSupabase } from "@/lib/supabase/client"
import type { Category } from "@/lib/types"

/** The single shared category list (bills, income and bank types all use it). */
export async function fetchCategories(): Promise<Category[]> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from("categories")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true })
  if (error) throw error
  return (data ?? []) as Category[]
}

export async function createCategory(name: string): Promise<Category> {
  const supabase = getSupabase()
  const clean = name.trim()
  // Reuse an existing category with the same name (case-insensitive).
  const { data: existing } = await supabase
    .from("categories")
    .select("*")
    .ilike("name", clean)
    .limit(1)
  if (existing && existing[0]) return existing[0] as Category

  const { data: last } = await supabase
    .from("categories")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
  const sort_order = (last?.[0]?.sort_order ?? -1) + 1
  const { data, error } = await supabase
    .from("categories")
    .insert({ name: clean, sort_order })
    .select("*")
    .single()
  if (error) throw error
  return data as Category
}

export async function renameCategory(id: string, name: string): Promise<void> {
  const supabase = getSupabase()
  const { error } = await supabase
    .from("categories")
    .update({ name: name.trim() })
    .eq("id", id)
  if (error) throw error
}

/** Delete a category. Entries keep their data; category_id is set null by FK. */
export async function deleteCategory(id: string): Promise<void> {
  const supabase = getSupabase()
  const { error } = await supabase.from("categories").delete().eq("id", id)
  if (error) throw error
}

export async function reorderCategories(
  updates: { id: string; sort_order: number }[],
): Promise<void> {
  const supabase = getSupabase()
  await Promise.all(
    updates.map((u) =>
      supabase
        .from("categories")
        .update({ sort_order: u.sort_order })
        .eq("id", u.id),
    ),
  )
}
