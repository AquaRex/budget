import { getSupabase } from "@/lib/supabase/client"
import type { Category } from "@/lib/types"
import { fetchTransactions, fetchTxRules } from "@/lib/data/transactions"
import { fetchTypeCategories } from "@/lib/data/type-categories"

function check({ error }: { error: unknown }): void {
  if (error) {
    throw error
  }
}

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

async function findByName(name: string): Promise<Category | null> {
  const { data } = await getSupabase().from("categories").select("*").ilike("name", name).limit(1)
  return (data?.[0] as Category | undefined) ?? null
}

async function nextCategorySortOrder(): Promise<number> {
  const { data } = await getSupabase()
    .from("categories")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
  return (data?.[0]?.sort_order ?? -1) + 1
}

/**
 * Create a category in a group (null = "Needs sorting"). Names are unique per
 * user, so an existing category with the same name (case-insensitive) is
 * returned as is.
 */
export async function createCategory(name: string, groupId: string | null = null): Promise<Category> {
  const clean = name.trim()
  const existing = await findByName(clean)
  if (existing) {
    return existing
  }
  const { data, error } = await getSupabase()
    .from("categories")
    .insert({ name: clean, sort_order: await nextCategorySortOrder(), group_id: groupId })
    .select("*")
    .single()
  check({ error })
  return data as Category
}

/** Create a group, or promote an existing category with that name to one. */
export async function createGroup(name: string): Promise<Category> {
  const clean = name.trim()
  const existing = await findByName(clean)
  if (existing) {
    if (!existing.is_group) {
      await setCategoryIsGroup(existing.id, true)
    }
    return { ...existing, is_group: true, group_id: null }
  }
  const { data, error } = await getSupabase()
    .from("categories")
    .insert({ name: clean, sort_order: await nextCategorySortOrder(), is_group: true })
    .select("*")
    .single()
  check({ error })
  return data as Category
}

/**
 * Make a category a group (it leaves any group it was in) or a plain category.
 * A group that budget entries use can't stop being one.
 */
export async function setCategoryIsGroup(id: string, isGroup: boolean): Promise<void> {
  const supabase = getSupabase()
  if (!isGroup) {
    const { count } = await supabase
      .from("entries")
      .select("id", { count: "exact", head: true })
      .eq("category_id", id)
    if (count) {
      throw new Error("This group is used by budget entries; move them to another group first.")
    }
  }
  check(
    await supabase
      .from("categories")
      .update(isGroup ? { is_group: true, group_id: null } : { is_group: false })
      .eq("id", id),
  )
}

/** Throws unless every given id is a group (budget entries may only use groups). */
export async function assertGroups(ids: (string | null)[]): Promise<void> {
  const wanted = Array.from(new Set(ids.filter((id): id is string => !!id)))
  if (wanted.length === 0) {
    return
  }
  const { data, error } = await getSupabase().from("categories").select("id,is_group").in("id", wanted)
  check({ error })
  const rows = (data ?? []) as { id: string; is_group: boolean }[]
  const groups = new Set(rows.filter((c) => c.is_group).map((c) => c.id))
  if (wanted.some((id) => !groups.has(id))) {
    throw new Error("Budget entries can only use groups.")
  }
}

async function fetchCategory(id: string): Promise<Category> {
  const { data, error } = await getSupabase().from("categories").select("*").eq("id", id).single()
  check({ error })
  return data as Category
}

/**
 * Repoint transactions, rules and bank-type mappings from one category to
 * another; with null, transactions become uncategorised and the rules and
 * mappings that pointed there are removed. Each move is one update statement.
 */
async function moveCategoryRefs(fromId: string, toId: string | null): Promise<void> {
  const supabase = getSupabase()
  check(await supabase.from("transactions").update({ category_id: toId }).eq("category_id", fromId))
  if (toId) {
    // tx_rules and type_categories are unique on pattern / bank type, not on
    // category, so repointing them can never collide.
    check(await supabase.from("tx_rules").update({ category_id: toId }).eq("category_id", fromId))
    check(await supabase.from("type_categories").update({ category_id: toId }).eq("category_id", fromId))
  } else {
    check(await supabase.from("tx_rules").delete().eq("category_id", fromId))
    check(await supabase.from("type_categories").delete().eq("category_id", fromId))
  }
}

/**
 * Merge one category into another: everything that pointed at `fromId`
 * (transactions, rules, bank-type mappings, budget entries, member categories)
 * moves to `intoId`, then `fromId` is deleted. Merging a group needs a group
 * target, since entries and member categories must point at a group.
 */
export async function mergeCategories(fromId: string, intoId: string): Promise<void> {
  if (fromId === intoId) {
    return
  }
  const [from, into] = await Promise.all([fetchCategory(fromId), fetchCategory(intoId)])
  if (from.is_group && !into.is_group) {
    throw new Error("A group can only be merged into another group.")
  }
  const supabase = getSupabase()
  await moveCategoryRefs(fromId, intoId)
  check(await supabase.from("entries").update({ category_id: intoId }).eq("category_id", fromId))
  check(await supabase.from("categories").update({ group_id: into.is_group ? intoId : null }).eq("group_id", fromId))
  check(await supabase.from("categories").delete().eq("id", fromId))
}

/**
 * Delete a (non-group) category, moving its transactions, rules and bank-type
 * mappings to `reassignTo` (null = uncategorised; its rules and mappings go).
 * Use deleteGroup for groups.
 */
export async function deleteCategory(id: string, reassignTo: string | null): Promise<void> {
  const category = await fetchCategory(id)
  if (category.is_group) {
    throw new Error("Use deleteGroup to delete a group.")
  }
  await moveCategoryRefs(id, reassignTo)
  check(await getSupabase().from("categories").delete().eq("id", id))
}

/**
 * Delete a group: its budget entries move to the group `entriesTo` (null =
 * entries without a group); its member categories, and anything placed
 * directly on the group, move to the group `categoriesTo` (null = "Needs
 * sorting" / uncategorised).
 */
export async function deleteGroup(
  id: string,
  { categoriesTo, entriesTo }: { categoriesTo: string | null; entriesTo: string | null },
): Promise<void> {
  if (categoriesTo === id || entriesTo === id) {
    throw new Error("Pick a different group to move things to.")
  }
  await assertGroups([entriesTo, categoriesTo])
  const supabase = getSupabase()
  check(await supabase.from("entries").update({ category_id: entriesTo }).eq("category_id", id))
  check(await supabase.from("categories").update({ group_id: categoriesTo }).eq("group_id", id))
  await moveCategoryRefs(id, categoriesTo)
  check(await supabase.from("categories").delete().eq("id", id))
}

export async function renameCategory(id: string, name: string): Promise<void> {
  const supabase = getSupabase()
  const { error } = await supabase
    .from("categories")
    .update({ name: name.trim() })
    .eq("id", id)
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

/** Flag a group as savings/investments (its money is set aside, not spent). */
export async function setCategorySavings(id: string, isSavings: boolean): Promise<void> {
  const supabase = getSupabase()
  const { error } = await supabase
    .from("categories")
    .update({ is_savings: isSavings })
    .eq("id", id)
  if (error) {
    throw error
  }
}

/** A category that is really a bank "Type" (named after one), with what still uses it. */
export type BankTypeCategory = {
  category: Category
  transactions: number // transactions placed on it explicitly
  mappedTransactions: number // uncategorised transactions reaching it via a bank-type mapping
  rules: number
  mappings: number // bank types mapped to it
  entries: number // budget entries, any year
}

/**
 * Categories whose name equals a bank type seen in transactions or bank-type
 * mappings, for a cleanup UI (merge each into a real category). Reads every
 * row (paged), so the counts are complete.
 */
export async function fetchBankTypeCategories(): Promise<BankTypeCategory[]> {
  const [categories, transactions, rules, typeCategories, entryCategoryIds] = await Promise.all([
    fetchCategories(),
    fetchTransactions(),
    fetchTxRules(),
    fetchTypeCategories(),
    fetchEntryCategoryIds(),
  ])
  const bankTypes = new Set<string>()
  for (const t of transactions) {
    if (t.type?.trim()) {
      bankTypes.add(t.type.trim().toLowerCase())
    }
  }
  for (const m of typeCategories) {
    bankTypes.add(m.bank_type.trim().toLowerCase())
  }
  const typeTarget = new Map(typeCategories.map((m) => [m.bank_type, m.category_id]))
  const countBy = (ids: (string | null | undefined)[]) => {
    const counts = new Map<string, number>()
    for (const id of ids) {
      if (id) {
        counts.set(id, (counts.get(id) ?? 0) + 1)
      }
    }
    return counts
  }
  const explicit = countBy(transactions.map((t) => t.category_id))
  const viaMapping = countBy(
    transactions.map((t) => (t.category_id || !t.type ? null : typeTarget.get(t.type))),
  )
  const ruleCounts = countBy(rules.map((r) => r.category_id))
  const mappingCounts = countBy(typeCategories.map((m) => m.category_id))
  const entryCounts = countBy(entryCategoryIds)
  return categories
    .filter((c) => bankTypes.has(c.name.trim().toLowerCase()))
    .map((c) => ({
      category: c,
      transactions: explicit.get(c.id) ?? 0,
      mappedTransactions: viaMapping.get(c.id) ?? 0,
      rules: ruleCounts.get(c.id) ?? 0,
      mappings: mappingCounts.get(c.id) ?? 0,
      entries: entryCounts.get(c.id) ?? 0,
    }))
}

/** category_id of every budget entry, all years (paged past the 1000-row cap). */
async function fetchEntryCategoryIds(): Promise<(string | null)[]> {
  const PAGE = 1000
  const out: (string | null)[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await getSupabase()
      .from("entries")
      .select("id,category_id")
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1)
    check({ error })
    const page = (data ?? []) as { category_id: string | null }[]
    out.push(...page.map((e) => e.category_id))
    if (page.length < PAGE) {
      break
    }
  }
  return out
}
