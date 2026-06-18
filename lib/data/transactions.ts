import { getSupabase } from "@/lib/supabase/client"
import type { ImportBatch, Transaction, TxRule } from "@/lib/types"
import type { ParsedTx } from "@/lib/csv"
import {
  classifyImport,
  ruleCategoryFor,
  sourceKeyFor,
  txMatchesSource,
  type ImportPlan,
} from "@/lib/spending"

export async function fetchTransactions(): Promise<Transaction[]> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from("transactions")
    .select("*")
    .order("booked_date", { ascending: false })
    .order("created_at", { ascending: false })
  if (error) throw error
  return (data ?? []) as Transaction[]
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
  conflicts: number
  unchanged: number
}

/**
 * Apply a parsed CSV: insert new rows (auto-categorised by rules), record
 * proposed updates on conflicting rows, and create an import batch. Returns a
 * summary so the UI can tell the user what happened.
 */
export async function importTransactions(
  parsed: ParsedTx[],
  existing: Transaction[],
  rules: TxRule[],
  meta: { label: string; filename: string },
): Promise<ImportSummary> {
  const supabase = getSupabase()
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

  if (plan.toInsert.length > 0) {
    const rows = plan.toInsert.map((r) => ({
      import_id: importId,
      booked_date: r.booked_date,
      tx_date: r.tx_date,
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
    // Ignore duplicates that slipped in concurrently.
    const { error } = await supabase
      .from("transactions")
      .upsert(rows, { onConflict: "user_id,dedup_key", ignoreDuplicates: true })
    if (error) throw error
  }

  // Store the proposed new value on each conflicting existing row.
  await Promise.all(
    plan.conflicts.map((c) =>
      supabase
        .from("transactions")
        .update({
          pending_amount: c.incoming.amount,
          pending_booked_date: c.incoming.booked_date,
        })
        .eq("id", c.existing.id),
    ),
  )

  return {
    inserted: plan.toInsert.length,
    conflicts: plan.conflicts.length,
    unchanged: plan.unchangedCount,
  }
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
 * account) and persist a rule so future imports inherit it. Passing null
 * clears the category for the whole source and removes the rule.
 * Returns how many transactions were updated.
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

  const { data } = await supabase.from("transactions").select("*")
  const matches = ((data ?? []) as Transaction[]).filter((t) =>
    txMatchesSource(t, src.matchType, src.pattern),
  )
  await Promise.all(
    matches.map((t) =>
      supabase
        .from("transactions")
        .update({ category_id: categoryId })
        .eq("id", t.id),
    ),
  )
  return matches.length
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

  // Re-categorise existing matches (only those without a category yet).
  const { data: rows } = await supabase
    .from("transactions")
    .select("*")
    .is("category_id", null)
  const matches = ((rows ?? []) as Transaction[]).filter(
    (t) => ruleCategoryFor(t, [r]) === categoryId,
  )
  await Promise.all(
    matches.map((t) =>
      supabase
        .from("transactions")
        .update({ category_id: categoryId })
        .eq("id", t.id),
    ),
  )
  return matches.length
}

export async function deleteRule(id: string): Promise<void> {
  const supabase = getSupabase()
  const { error } = await supabase.from("tx_rules").delete().eq("id", id)
  if (error) throw error
}
