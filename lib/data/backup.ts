"use client"

// Full backup: every table you own, rows exactly as stored (all columns), in
// one JSON file. Read-only — nothing is changed. Wiping data is never done from
// the site; that happens in the database itself.

import { getSupabase } from "@/lib/supabase/client"

/** Every table holding your data (dropped legacy tables left out). */
export const BACKUP_TABLES = [
  "transactions",
  "imports",
  "csv_raw_rows",
  "bank_raw_transactions",
  "bank_fetches",
  "bank_sessions",
  "categories",
  "type_categories",
  "tx_rules",
  "tx_match_rules",
  "labels",
  "pending_labels",
  "entries",
  "entry_amounts",
  "salary_settings",
  "payment_methods",
  "goals",
  "holdings",
  "holding_trades",
  "holding_prices",
  "loans",
  "account_names",
  "payment_cards",
] as const

type TableDump = { count: number; rows: unknown[]; error?: string }

export type Backup = {
  format: "budget-backup-v1"
  exported_at: string
  user_id: string | null
  note: string
  tables: Record<string, TableDump>
}

const PAGE = 1000

async function dumpTable(table: string): Promise<TableDump> {
  const supabase = getSupabase()
  const { count, error: countErr } = await supabase
    .from(table)
    .select("*", { count: "exact", head: true })
  if (countErr) return { count: 0, rows: [], error: countErr.message }
  const total = count ?? 0
  const rows: unknown[] = []
  // A stable order so paging can't skip or repeat rows (most tables have id).
  let ordered = true
  for (let from = 0; from < total; from += PAGE) {
    let q = supabase
      .from(table)
      .select("*")
      .range(from, from + PAGE - 1)
    if (ordered) q = q.order("id", { ascending: true })
    let { data, error } = await q
    if (error && ordered && from === 0) {
      // No id column: fall back to the table's natural order.
      ordered = false
      ;({ data, error } = await supabase
        .from(table)
        .select("*")
        .range(from, from + PAGE - 1))
    }
    if (error) return { count: total, rows, error: error.message }
    rows.push(...(data ?? []))
  }
  const dump: TableDump = { count: total, rows }
  if (rows.length !== total) {
    dump.error = `Expected ${total} rows, got ${rows.length}`
  }
  return dump
}

export async function buildBackup(
  onProgress?: (table: string, i: number, n: number) => void,
): Promise<Backup> {
  const {
    data: { user },
  } = await getSupabase().auth.getUser()
  const tables: Record<string, TableDump> = {}
  for (let i = 0; i < BACKUP_TABLES.length; i++) {
    const t = BACKUP_TABLES[i]
    onProgress?.(t, i, BACKUP_TABLES.length)
    tables[t] = await dumpTable(t)
  }
  return {
    format: "budget-backup-v1",
    exported_at: new Date().toISOString(),
    user_id: user?.id ?? null,
    note: "Rows exactly as stored in the database. Card number/CVC/PIN live encrypted in Supabase Vault and are not included.",
    tables,
  }
}

export function downloadBackup(backup: Backup): void {
  const blob = new Blob([JSON.stringify(backup, null, 2)], {
    type: "application/json",
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `budget-backup-${backup.exported_at.slice(0, 10)}.json`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
