export type EntryKind = "bill" | "income"

// Categories are a single shared pool (used by both bills and income, and
// auto-populated from the bank's transaction types).
export type Category = {
  id: string
  user_id: string
  name: string
  sort_order: number
  // Marks a category as a high-level "group" on the Groups page (budget vs
  // actual). Independent of bills/income — they ignore this flag.
  is_group: boolean
}

export type PaymentMethod = {
  id: string
  user_id: string
  name: string
  sort_order: number
}

export type Entry = {
  id: string
  user_id: string
  kind: EntryKind
  name: string
  category_id: string | null
  method_id: string | null
  due_day: number
  is_recurring: boolean
  default_amount: number
  is_active: boolean
  is_salary: boolean
  sort_order: number
  created_at: string
}

export type EntryAmount = {
  id: string
  user_id: string
  entry_id: string
  month: number // 1-12
  amount: number
}

// --- Spending / actual transactions (bank CSV import) ---

export type ImportBatch = {
  id: string
  user_id: string
  label: string | null
  filename: string | null
  uploaded_at: string
  row_count: number
  created_at: string
}

export type Transaction = {
  id: string
  user_id: string
  import_id: string | null
  booked_date: string // ISO date
  tx_date: string | null
  type: string | null
  description: string | null
  message: string | null
  amount: number // negative = out (spending), positive = in (income)
  currency: string
  from_account: string | null
  to_account: string | null
  category_id: string | null
  is_internal: boolean
  is_excluded: boolean
  dedup_key: string
  identity_key: string
  pending_amount: number | null
  pending_booked_date: string | null
  created_at: string
}

export type TypeCategory = {
  id: string
  user_id: string
  bank_type: string
  category_id: string
  created_at: string
}

// Maps a bank "Type" to a group category (categories.is_group). Used only by
// the Groups page; type_categories (above) is left untouched for Spending.
export type TypeGroup = {
  id: string
  user_id: string
  bank_type: string
  group_id: string
  created_at: string
}

export type TxMatchType = "description" | "account"

export type TxRule = {
  id: string
  user_id: string
  match_type: TxMatchType
  pattern: string
  category_id: string | null
  created_at: string
}

// Payload when creating/editing an entry's settings (no amounts/order here).
export type EntryInput = {
  kind: EntryKind
  name: string
  category_id: string | null
  method_id: string | null
  due_day: number
  is_recurring: boolean
  default_amount: number
  is_active: boolean
}
