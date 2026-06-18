import { getSupabase } from "@/lib/supabase/client"
import type { TypeCategory } from "@/lib/types"

export async function fetchTypeCategories(): Promise<TypeCategory[]> {
  const supabase = getSupabase()
  const { data, error } = await supabase.from("type_categories").select("*")
  if (error) throw error
  return (data ?? []) as TypeCategory[]
}

/** Map a bank type to a category, or pass null to leave it ungrouped. */
export async function setTypeCategory(
  bankType: string,
  categoryId: string | null,
): Promise<void> {
  const supabase = getSupabase()
  if (categoryId === null) {
    const { error } = await supabase
      .from("type_categories")
      .delete()
      .eq("bank_type", bankType)
    if (error) throw error
    return
  }
  const { error } = await supabase
    .from("type_categories")
    .upsert(
      { bank_type: bankType, category_id: categoryId },
      { onConflict: "user_id,bank_type" },
    )
  if (error) throw error
}
