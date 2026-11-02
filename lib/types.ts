export type EntryKind = "bill" | "income"

// Categories are a single shared pool. Some are groups (is_group): the units
// the budget (Bills/Income entries) and the Groups page work in. Every other
// category should belong to a group via group_id; null = "Needs sorting".
export type Category = {
  id: string
  user_id: string
  name: string
  sort_order: number
  is_group: boolean
  // The group this category rolls up into, or null. Unused on groups.
  group_id: string | null
  // A savings/investment group: money placed here is set aside, not spent.
  is_savings: boolean
  // Money out here stays spending, but Goals count it as progress.
  counts_to_goals: boolean
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
  year: number
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
  year: number
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
  tx_at: string | null // full purchase timestamp "yyyy-mm-ddThh:mm"
  is_booked: boolean
  type: string | null
  description: string | null
  message: string | null
  amount: number // negative = out (spending), positive = in (income)
  currency: string
  from_account: string | null
  to_account: string | null
  category_id: string | null
  label_id: string | null
  is_internal: boolean
  is_excluded: boolean
  dedup_key: string
  identity_key: string
  pending_amount: number | null
  pending_booked_date: string | null
  created_at: string
}

// A manual, per-transaction tag below the category (e.g. a specific game under
// "Steam"). Never auto-assigned; set by hand and reused by name.
export type Label = {
  id: string
  user_id: string
  name: string
  created_at: string
}

export type TypeCategory = {
  id: string
  user_id: string
  bank_type: string
  category_id: string
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

/** A detailed rule: every condition that's set must match (text contains, accounts exact, amount ignoring sign). */
export type MatchRule = {
  id: string
  description: string | null
  message: string | null
  type: string | null
  from_account: string | null
  to_account: string | null
  amount_min: number | null
  amount_max: number | null
  category_id: string
  created_at: string
}

export type MatchRuleInput = Omit<MatchRule, "id" | "created_at">

// Payload when creating/editing an entry's settings (no amounts/order here).
export type EntryInput = {
  kind: EntryKind
  year: number
  name: string
  category_id: string | null
  method_id: string | null
  due_day: number
  is_recurring: boolean
  default_amount: number
  is_active: boolean
}
