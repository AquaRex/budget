import { getSupabase } from "@/lib/supabase/client"
import type { Entry, EntryAmount, EntryInput, EntryKind } from "@/lib/types"

export async function fetchEntries(
  kind: EntryKind,
  year: number,
): Promise<Entry[]> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from("entries")
    .select("*")
    .eq("kind", kind)
    .eq("year", year)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true })
  if (error) throw error
  return (data ?? []) as Entry[]
}

export async function fetchAmounts(year: number): Promise<EntryAmount[]> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from("entry_amounts")
    .select("*")
    .eq("year", year)
  if (error) throw error
  return (data ?? []) as EntryAmount[]
}

/** Distinct years that have any budget entries, newest first. */
export async function fetchEntryYears(): Promise<number[]> {
  const supabase = getSupabase()
  const { data, error } = await supabase.from("entries").select("year")
  if (error) throw error
  const years = new Set<number>()
  for (const r of (data ?? []) as { year: number }[]) years.add(r.year)
  return Array.from(years).sort((a, b) => b - a)
}

async function nextSortOrder(
  kind: EntryKind,
  year: number,
  categoryId: string | null,
): Promise<number> {
  const supabase = getSupabase()
  let q = supabase
    .from("entries")
    .select("sort_order")
    .eq("kind", kind)
    .eq("year", year)
  q = categoryId === null ? q.is("category_id", null) : q.eq("category_id", categoryId)
  const { data } = await q.order("sort_order", { ascending: false }).limit(1)
  return (data?.[0]?.sort_order ?? -1) + 1
}

export async function createEntry(input: EntryInput): Promise<Entry> {
  const supabase = getSupabase()
  const sort_order = await nextSortOrder(input.kind, input.year, input.category_id)
  const { data, error } = await supabase
    .from("entries")
    .insert({ ...input, sort_order })
    .select("*")
    .single()
  if (error) throw error
  return data as Entry
}

export async function updateEntry(
  id: string,
  input: EntryInput,
): Promise<Entry> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from("entries")
    .update(input)
    .eq("id", id)
    .select("*")
    .single()
  if (error) throw error
  return data as Entry
}

export async function deleteEntry(id: string): Promise<void> {
  const supabase = getSupabase()
  const { error } = await supabase.from("entries").delete().eq("id", id)
  if (error) throw error
}

/** Persist new category/order for a batch of entries (drag reorder). */
export async function reorderEntries(
  updates: { id: string; category_id: string | null; sort_order: number }[],
): Promise<void> {
  const supabase = getSupabase()
  await Promise.all(
    updates.map((u) =>
      supabase
        .from("entries")
        .update({ category_id: u.category_id, sort_order: u.sort_order })
        .eq("id", u.id),
    ),
  )
}

/**
 * Set the amount for a month. A null value removes the override (the cell
 * reverts to the recurring/salary default, or empty for one-time entries).
 */
export async function setAmount(
  entryId: string,
  year: number,
  month: number,
  amount: number | null,
): Promise<void> {
  const supabase = getSupabase()
  if (amount === null) {
    const { error } = await supabase
      .from("entry_amounts")
      .delete()
      .eq("entry_id", entryId)
      .eq("year", year)
      .eq("month", month)
    if (error) throw error
    return
  }
  const { error } = await supabase
    .from("entry_amounts")
    .upsert(
      { entry_id: entryId, year, month, amount },
      { onConflict: "entry_id,year,month" },
    )
  if (error) throw error
}
