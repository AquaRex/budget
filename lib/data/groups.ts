import { getSupabase } from "@/lib/supabase/client"
import type { TypeGroup } from "@/lib/types"

export async function fetchTypeGroups(): Promise<TypeGroup[]> {
  const supabase = getSupabase()
  const { data, error } = await supabase.from("type_groups").select("*")
  if (error) throw error
  return (data ?? []) as TypeGroup[]
}

/** Map a bank type to a group, or pass null to leave it unassigned. */
export async function setTypeGroup(
  bankType: string,
  groupId: string | null,
): Promise<void> {
  const supabase = getSupabase()
  if (groupId === null) {
    const { error } = await supabase
      .from("type_groups")
      .delete()
      .eq("bank_type", bankType)
    if (error) throw error
    return
  }
  const { error } = await supabase
    .from("type_groups")
    .upsert(
      { bank_type: bankType, group_id: groupId },
      { onConflict: "user_id,bank_type" },
    )
  if (error) throw error
}

/** Flag (or unflag) a category as a high-level group on the Groups page. */
export async function setCategoryIsGroup(
  categoryId: string,
  isGroup: boolean,
): Promise<void> {
  const supabase = getSupabase()
  const { error } = await supabase
    .from("categories")
    .update({ is_group: isGroup })
    .eq("id", categoryId)
  if (error) throw error
}
