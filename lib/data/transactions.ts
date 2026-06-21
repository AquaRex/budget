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
  updated: number
  unchanged: number
}

const isInternalType = (type: string) =>
  /overf/i.test(type) || type.toLowerCase() === "nettbank"

/**
 * Make sure every bank "Type" in the import exists as a category and is mapped
 * to it (unless the user already mapped that type elsewhere). The bank CSV is
 * the source of truth, so its categories flow into our shared pool.
 */
async function ensureCategoriesForTypes(types: (string | null)[]): Promise<void> {
  const supabase = getSupabase()
  const clean = Array.from(
    new Set(
      types
        .map((t) => (t ?? "").trim())
        .filter((t) => t !== "" && !isInternalType(t)),
    ),
  )
  if (clean.length === 0) return

  const { data: cats } = await supabase.from("categories").select("id,name")
  const byName = new Map(
    ((cats ?? []) as { id: string; name: string }[]).map((c) => [
      c.name.toLowerCase(),
      c.id,
    ]),
  )
  const { data: maps } = await supabase
    .from("type_categories")
    .select("bank_type")
  const mapped = new Set(
    ((maps ?? []) as { bank_type: string }[]).map((m) => m.bank_type),
  )

  for (const type of clean) {
    let catId = byName.get(type.toLowerCase())
    if (!catId) {
      try {
        const { data } = await supabase
          .from("categories")
          .insert({ name: type })
          .select("id")
          .single()
        catId = (data as { id: string } | null)?.id
        if (catId) byName.set(type.toLowerCase(), catId)
      } catch {
        // A racing insert may have created it; look it up.
        const { data } = await supabase
          .from("categories")
          .select("id")
          .ilike("name", type)
          .limit(1)
        catId = (data?.[0] as { id: string } | undefined)?.id
      }
    }
    if (catId && !mapped.has(type)) {
      await supabase
        .from("type_categories")
        .upsert(
          { bank_type: type, category_id: catId },
          { onConflict: "user_id,bank_type" },
        )
    }
  }
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

  // Promote any new bank types into our shared category pool first, so the
  // freshly imported rows resolve to a category immediately.
  await ensureCategoriesForTypes(parsed.map((r) => r.type))

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
  const ids = new Set(
    ((data ?? []) as Transaction[])
      .filter((t) => txMatchesSource(t, src.matchType, src.pattern))
      .map((t) => t.id),
  )
  ids.add(tx.id) // always apply to the one the user clicked
  await Promise.all(
    Array.from(ids).map((id) =>
      supabase
        .from("transactions")
        .update({ category_id: categoryId })
        .eq("id", id),
    ),
  )
  return ids.size
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
