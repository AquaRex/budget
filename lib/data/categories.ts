import { getSupabase } from "@/lib/supabase/client"
import type { Category, EntryKind } from "@/lib/types"

export async function fetchCategories(kind: EntryKind): Promise<Category[]> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from("categories")
    .select("*")
    .eq("kind", kind)
    .order("sort_order", { ascending: true })
  if (error) throw error
  return (data ?? []) as Category[]
}

export async function createCategory(
  kind: EntryKind,
  name: string,
): Promise<Category> {
  const supabase = getSupabase()
  const { data: last } = await supabase
    .from("categories")
    .select("sort_order")
    .eq("kind", kind)
    .order("sort_order", { ascending: false })
    .limit(1)
  const sort_order = (last?.[0]?.sort_order ?? -1) + 1
  const { data, error } = await supabase
    .from("categories")
    .insert({ kind, name: name.trim(), sort_order })
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
