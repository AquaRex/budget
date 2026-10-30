import { getSupabase } from "@/lib/supabase/client"
import { assertGroups } from "@/lib/data/categories"
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

/** category_id + year of every budget entry, all years (paged past the 1000-row cap). */
async function fetchAllEntryKeys(): Promise<{ category_id: string | null; year: number }[]> {
  const PAGE = 1000
  const out: { category_id: string | null; year: number }[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await getSupabase()
      .from("entries")
      .select("id,category_id,year")
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) {
      throw error
    }
    const page = (data ?? []) as { category_id: string | null; year: number }[]
    out.push(...page)
    if (page.length < PAGE) {
      break
    }
  }
  return out
}

/** Distinct years that have any budget entries, newest first. */
export async function fetchEntryYears(): Promise<number[]> {
  const years = new Set((await fetchAllEntryKeys()).map((e) => e.year))
  return Array.from(years).sort((a, b) => b - a)
}

/**
 * Budget entries per category across every year (category id -> total and per
 * year), so delete/merge dialogs can warn about rows in years not on screen.
 */
export async function fetchEntryCountsByCategory(): Promise<
  Map<string, { total: number; byYear: Record<number, number> }>
> {
  const counts = new Map<string, { total: number; byYear: Record<number, number> }>()
  for (const e of await fetchAllEntryKeys()) {
    if (!e.category_id) {
      continue
    }
    const c = counts.get(e.category_id) ?? { total: 0, byYear: {} }
    c.total++
    c.byYear[e.year] = (c.byYear[e.year] ?? 0) + 1
    counts.set(e.category_id, c)
  }
  return counts
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
  await assertGroups([input.category_id])
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
  await assertGroups([input.category_id])
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
  await assertGroups(updates.map((u) => u.category_id))
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
