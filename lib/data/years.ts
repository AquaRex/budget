import { getSupabase } from "@/lib/supabase/client"
import type { Entry, EntryAmount } from "@/lib/types"

type SalaryRow = {
  yearly_salary: number
  tax_pct: number
  half_tax_pct: number
  vacation_rate_pct: number
  feriepenger_month: number
  half_tax_month: number
  workdays_per_month: number
  vacation_days: number
  deduction_days: number
}

/** Delete a year's entire budget (entries cascade their amounts) and salary. */
export async function deleteYearBudget(year: number): Promise<void> {
  const supabase = getSupabase()
  const { error: e1 } = await supabase.from("entries").delete().eq("year", year)
  if (e1) throw e1
  const { error: e2 } = await supabase
    .from("salary_settings")
    .delete()
    .eq("year", year)
  if (e2) throw e2
}

/**
 * Copy a whole year's budget (bills, income, per-month amounts and the salary
 * profile) from one year to another, REPLACING the target year's data.
 */
export async function copyYearBudget(
  fromYear: number,
  toYear: number,
): Promise<void> {
  if (fromYear === toYear) return
  const supabase = getSupabase()

  // 1. Wipe the target year (entry_amounts cascade off entries).
  const { error: delEntries } = await supabase
    .from("entries")
    .delete()
    .eq("year", toYear)
  if (delEntries) throw delEntries
  const { error: delSalary } = await supabase
    .from("salary_settings")
    .delete()
    .eq("year", toYear)
  if (delSalary) throw delSalary

  // 2. Read the source year.
  const [{ data: srcEntries, error: e1 }, { data: srcAmounts, error: e2 }] =
    await Promise.all([
      supabase.from("entries").select("*").eq("year", fromYear),
      supabase.from("entry_amounts").select("*").eq("year", fromYear),
    ])
  if (e1) throw e1
  if (e2) throw e2

  const amountsByEntry = new Map<string, EntryAmount[]>()
  for (const a of (srcAmounts ?? []) as EntryAmount[]) {
    const list = amountsByEntry.get(a.entry_id)
    if (list) list.push(a)
    else amountsByEntry.set(a.entry_id, [a])
  }

  // 3. Re-create each entry (new id) and its amounts under the target year.
  for (const e of (srcEntries ?? []) as Entry[]) {
    const { data: ins, error } = await supabase
      .from("entries")
      .insert({
        kind: e.kind,
        year: toYear,
        name: e.name,
        category_id: e.category_id,
        method_id: e.method_id,
        due_day: e.due_day,
        is_recurring: e.is_recurring,
        default_amount: e.default_amount,
        is_active: e.is_active,
        is_salary: e.is_salary,
        sort_order: e.sort_order,
      })
      .select("id")
      .single()
    if (error) throw error
    const newId = (ins as { id: string }).id
    const amts = amountsByEntry.get(e.id) ?? []
    if (amts.length > 0) {
      const { error: ae } = await supabase.from("entry_amounts").insert(
        amts.map((a) => ({
          entry_id: newId,
          year: toYear,
          month: a.month,
          amount: a.amount,
        })),
      )
      if (ae) throw ae
    }
  }

  // 4. Copy the salary profile.
  const { data: sal, error: se } = await supabase
    .from("salary_settings")
    .select("*")
    .eq("year", fromYear)
    .maybeSingle()
  if (se) throw se
  if (sal) {
    const s = sal as SalaryRow
    const { error: ue } = await supabase.from("salary_settings").upsert(
      {
        year: toYear,
        yearly_salary: s.yearly_salary,
        tax_pct: s.tax_pct,
        half_tax_pct: s.half_tax_pct,
        vacation_rate_pct: s.vacation_rate_pct,
        feriepenger_month: s.feriepenger_month,
        half_tax_month: s.half_tax_month,
        workdays_per_month: s.workdays_per_month,
        vacation_days: s.vacation_days,
        deduction_days: s.deduction_days,
      },
      { onConflict: "user_id,year" },
    )
    if (ue) throw ue
  }
}
