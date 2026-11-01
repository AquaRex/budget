import { getSupabase } from "@/lib/supabase/client"
import type { ImportBatch, Transaction, TxRule } from "@/lib/types"
import type { ParsedTx } from "@/lib/csv"
import {
  classifyImport,
  descMatches,
  effectiveCategoryId,
  ruleCategoryFor,
  sourceKeyFor,
  txMatchesSource,
  type ImportPlan,
  type TypeMap,
} from "@/lib/spending"

export async function fetchTransactions(): Promise<Transaction[]> {
  const supabase = getSupabase()
  // PostgREST returns at most 1000 rows per request, so page through all of
  // them — both the import de-dup and every view need the complete set.
  const PAGE = 1000
  const all: Transaction[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("transactions")
      .select("*")
      .order("booked_date", { ascending: false })
      .order("created_at", { ascending: false })
      // Unique tiebreaker: without it the sort isn't a total order (many rows
      // share booked_date + created_at), so paging with .range() could skip or
      // repeat rows at the 1000-row boundaries non-deterministically.
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) throw error
    const page = (data ?? []) as Transaction[]
    all.push(...page)
    if (page.length < PAGE) break
  }
  return all
}

export async function fetchImports(): Promise<ImportBatch[]> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from("imports")
    .select("*")
    .order("uploaded_at", { ascending: false })
  if (error) throw error
  return (data ?? []) as ImportBatch[]
}

export async function fetchTxRules(): Promise<TxRule[]> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from("tx_rules")
    .select("*")
    .order("created_at", { ascending: true })
  if (error) throw error
  return (data ?? []) as TxRule[]
}

export type ImportSummary = {
  inserted: number
  updated: number
  unchanged: number
}

/**
 * Apply a parsed CSV: insert new rows (auto-categorised by rules), record
 * proposed updates on conflicting rows, and create an import batch. Returns a
 * summary so the UI can tell the user what happened.
 */
export async function importTransactions(
  parsed: ParsedTx[],
  rules: TxRule[],
  meta: { label: string; filename: string },
): Promise<ImportSummary> {
  const supabase = getSupabase()
  // Always reconcile against the latest stored rows, never a stale snapshot.
  const existing = await fetchTransactions()
  const plan: ImportPlan = classifyImport(parsed, existing)

  // Record the import batch first so rows can reference it.
  const { data: imp, error: impErr } = await supabase
    .from("imports")
    .insert({
      label: meta.label || null,
      filename: meta.filename || null,
      row_count: parsed.length,
    })
    .select("*")
    .single()
  if (impErr) throw impErr
  const importId = (imp as ImportBatch).id

  let inserted = 0
  if (plan.toInsert.length > 0) {
    const rows = plan.toInsert.map((r) => ({
      import_id: importId,
      booked_date: r.booked_date,
      tx_date: r.tx_date,
      tx_at: r.tx_at,
      is_booked: r.is_booked,
      type: r.type,
      description: r.description,
      message: r.message,
      amount: r.amount,
      currency: r.currency,
      from_account: r.from_account,
      to_account: r.to_account,
      is_internal: r.is_internal,
      dedup_key: r.dedup_key,
      identity_key: r.identity_key,
      category_id: ruleCategoryFor(r, rules),
    }))
    // Rows already present (same user_id + dedup_key) are ignored; `.select()`
    // returns only the rows that were actually inserted, so the count is true.
    const { data: insertedRows, error } = await supabase
      .from("transactions")
      .upsert(rows, { onConflict: "user_id,dedup_key", ignoreDuplicates: true })
      .select("id")
    if (error) throw error
    inserted = insertedRows?.length ?? 0
  }

  // A pending row that settled (or otherwise changed) is updated in place so it
  // never duplicates. The user's category choice is preserved.
  await Promise.all(
    plan.toUpdate.map((u) =>
      supabase
        .from("transactions")
        .update({
          booked_date: u.incoming.booked_date,
          tx_date: u.incoming.tx_date,
          tx_at: u.incoming.tx_at,
          is_booked: u.incoming.is_booked,
          type: u.incoming.type,
          description: u.incoming.description,
          message: u.incoming.message,
          amount: u.incoming.amount,
          currency: u.incoming.currency,
          is_internal: u.incoming.is_internal,
          dedup_key: u.incoming.dedup_key,
          identity_key: u.incoming.identity_key,
          pending_amount: null,
          pending_booked_date: null,
        })
        .eq("id", u.existing.id),
    ),
  )

  return {
    inserted,
    updated: plan.toUpdate.length,
    unchanged: plan.unchangedCount + (plan.toInsert.length - inserted),
  }
}

/** Delete ALL imported transactions and import batches (irreversible). */
export async function deleteAllTransactions(): Promise<void> {
  const supabase = getSupabase()
  const all = "00000000-0000-0000-0000-000000000000"
  const { error: e1 } = await supabase
    .from("transactions")
    .delete()
    .neq("id", all)
  if (e1) throw e1
  const { error: e2 } = await supabase.from("imports").delete().neq("id", all)
  if (e2) throw e2
}

/** Resolve a conflict: keep the newer (pending) value, or discard it. */
export async function resolveConflict(
  tx: Transaction,
  keep: "new" | "old",
): Promise<void> {
  const supabase = getSupabase()
  const patch =
    keep === "new"
      ? {
          amount: tx.pending_amount,
          booked_date: tx.pending_booked_date ?? tx.booked_date,
          pending_amount: null,
          pending_booked_date: null,
        }
      : { pending_amount: null, pending_booked_date: null }
  const { error } = await supabase
    .from("transactions")
    .update(patch)
    .eq("id", tx.id)
  if (error) throw error
}

/** One-off exception: re-categorise a single transaction, leaving its merchant's rule alone. */
export async function setTransactionCategory(
  id: string,
  categoryId: string | null,
): Promise<void> {
  const supabase = getSupabase()
  const { error } = await supabase
    .from("transactions")
    .update({ category_id: categoryId })
    .eq("id", id)
  if (error) throw error
}

/**
 * Categorise every transaction sharing this one's source (same merchant /
 * account) across all time — regardless of any period the UI shows — and
 * persist a rule so future imports inherit it. Passing null clears the category
 * for the whole source and removes the rule. Use setTransactionCategory for a
 * one-off exception. Returns how many transactions were updated.
 */
export async function categorizeBySource(
  tx: Transaction,
  categoryId: string | null,
): Promise<number> {
  const supabase = getSupabase()
  const src = sourceKeyFor(tx)
  if (!src) {
    await setTransactionCategory(tx.id, categoryId)
    return 1
  }

  if (categoryId) {
    const { error } = await supabase.from("tx_rules").upsert(
      {
        match_type: src.matchType,
        pattern: src.pattern,
        category_id: categoryId,
      },
      { onConflict: "user_id,match_type,pattern" },
    )
    if (error) throw error
  } else {
    await supabase
      .from("tx_rules")
      .delete()
      .eq("match_type", src.matchType)
      .eq("pattern", src.pattern)
  }

  // Every matching row across all time (paged: a bare select stops at 1000 rows).
  const all = await fetchTransactions()
  const ids = new Set(
    all
      .filter((t) => txMatchesSource(t, src.matchType, src.pattern))
      .map((t) => t.id),
  )
  ids.add(tx.id) // always apply to the one the user clicked
  await setCategoryForIds(Array.from(ids), categoryId)
  return ids.size
}

const UPDATE_CHUNK = 200 // keeps the `id=in.(…)` URL well under length limits

/** Set one category on many transactions, a chunk of ids per update statement. */
export async function setCategoryForIds(
  ids: string[],
  categoryId: string | null,
): Promise<void> {
  const supabase = getSupabase()
  for (let i = 0; i < ids.length; i += UPDATE_CHUNK) {
    const { error } = await supabase
      .from("transactions")
      .update({ category_id: categoryId })
      .in("id", ids.slice(i, i + UPDATE_CHUNK))
    if (error) {
      throw error
    }
  }
}

/** Set (or clear, with null) the manual label on one transaction. */
export async function setTransactionLabel(
  id: string,
  labelId: string | null,
): Promise<void> {
  const supabase = getSupabase()
  const { error } = await supabase
    .from("transactions")
    .update({ label_id: labelId })
    .eq("id", id)
  if (error) throw error
}

/** Set (or clear) the manual label on many transactions at once. */
export async function setTransactionsLabel(
  ids: string[],
  labelId: string | null,
): Promise<void> {
  if (ids.length === 0) return
  const supabase = getSupabase()
  const { error } = await supabase
    .from("transactions")
    .update({ label_id: labelId })
    .in("id", ids)
  if (error) throw error
}

export async function setTransactionExcluded(
  id: string,
  excluded: boolean,
): Promise<void> {
  const supabase = getSupabase()
  const { error } = await supabase
    .from("transactions")
    .update({ is_excluded: excluded })
    .eq("id", id)
  if (error) throw error
}

export async function deleteImport(id: string): Promise<void> {
  const supabase = getSupabase()
  // Remove the batch's rows, then the batch.
  const del = await supabase.from("transactions").delete().eq("import_id", id)
  if (del.error) throw del.error
  const { error } = await supabase.from("imports").delete().eq("id", id)
  if (error) throw error
}

// --- Rules -----------------------------------------------------------------

/**
 * Create/replace a rule, then apply it to every matching uncategorised
 * transaction. Returns how many transactions were updated.
 */
export async function saveRuleAndApply(
  rule: { match_type: "description" | "account"; pattern: string },
  categoryId: string,
): Promise<number> {
  const supabase = getSupabase()
  const { data: saved, error } = await supabase
    .from("tx_rules")
    .upsert(
      {
        match_type: rule.match_type,
        pattern: rule.pattern,
        category_id: categoryId,
      },
      { onConflict: "user_id,match_type,pattern" },
    )
    .select("*")
    .single()
  if (error) throw error
  const r = saved as TxRule

  // Re-categorise existing matches (only those without a category yet), over
  // every row (paged: a bare select stops at 1000 rows).
  const matches = (await fetchTransactions()).filter(
    (t) => t.category_id === null && ruleCategoryFor(t, [r]) === categoryId,
  )
  await setCategoryForIds(
    matches.map((t) => t.id),
    categoryId,
  )
  return matches.length
}

/**
 * Add a "text contains" rule typed by hand, then give its category to every
 * matching transaction that has none yet — not even through its bank type.
 * Never overwrites an existing rule or any category already set. Returns how
 * many transactions were filled in.
 */
export async function addTextRule(
  pattern: string,
  categoryId: string,
  typeMap: TypeMap,
): Promise<number> {
  const supabase = getSupabase()
  const { error } = await supabase
    .from("tx_rules")
    .insert({ match_type: "description", pattern, category_id: categoryId })
  if (error) {
    throw error.code === "23505"
      ? new Error(`A rule for "${pattern}" already exists.`)
      : error
  }
  const matches = (await fetchTransactions()).filter(
    (t) =>
      effectiveCategoryId(t, typeMap) === null &&
      descMatches(t.description, pattern),
  )
  await setCategoryForIds(
    matches.map((t) => t.id),
    categoryId,
  )
  return matches.length
}

export async function deleteRule(id: string): Promise<void> {
  const supabase = getSupabase()
  const { error } = await supabase.from("tx_rules").delete().eq("id", id)
  if (error) throw error
}
