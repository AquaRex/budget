import { getSupabase } from "@/lib/supabase/client"

/** Assign a category to a group (another category), or null to unassign. */
export async function setCategoryGroup(
  categoryId: string,
  groupId: string | null,
): Promise<void> {
  const supabase = getSupabase()
  const { error } = await supabase
    .from("categories")
    .update({ group_id: groupId })
    .eq("id", categoryId)
  if (error) throw error
}
