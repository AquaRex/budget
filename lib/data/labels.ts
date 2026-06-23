import { getSupabase } from "@/lib/supabase/client"
import type { Label } from "@/lib/types"

/** Every manual transaction label (alphabetical). */
export async function fetchLabels(): Promise<Label[]> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from("labels")
    .select("*")
    .order("name", { ascending: true })
  if (error) throw error
  return (data ?? []) as Label[]
}

/** Create a label, reusing an existing one with the same name (case-insensitive). */
export async function createLabel(name: string): Promise<Label> {
  const supabase = getSupabase()
  const clean = name.trim()
  const { data: existing } = await supabase
    .from("labels")
    .select("*")
    .ilike("name", clean)
    .limit(1)
  if (existing && existing[0]) return existing[0] as Label

  const { data, error } = await supabase
    .from("labels")
    .insert({ name: clean })
    .select("*")
    .single()
  if (error) throw error
  return data as Label
}

export async function renameLabel(id: string, name: string): Promise<void> {
  const supabase = getSupabase()
  const { error } = await supabase
    .from("labels")
    .update({ name: name.trim() })
    .eq("id", id)
  if (error) throw error
}

/** Delete a label. Transactions keep their data; label_id is set null by FK. */
export async function deleteLabel(id: string): Promise<void> {
  const supabase = getSupabase()
  const { error } = await supabase.from("labels").delete().eq("id", id)
  if (error) throw error
}
