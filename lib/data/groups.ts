import { getSupabase } from "@/lib/supabase/client"
import { assertGroups } from "@/lib/data/categories"

/** Put a category in a group (must be a group), or null for "Needs sorting". */
export async function setCategoryGroup(
  categoryId: string,
  groupId: string | null,
): Promise<void> {
  await assertGroups([groupId])
  const supabase = getSupabase()
  const { error } = await supabase
    .from("categories")
    .update({ group_id: groupId })
    .eq("id", categoryId)
  if (error) throw error
}
