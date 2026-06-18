export type EntryKind = "bill" | "income"

export type Category = {
  id: string
  user_id: string
  kind: EntryKind
  name: string
  sort_order: number
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
