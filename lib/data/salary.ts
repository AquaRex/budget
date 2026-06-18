import { getSupabase } from "@/lib/supabase/client"
import type { SalaryProfile } from "@/lib/salary"
import type { Entry } from "@/lib/types"

type Row = {
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

function fromRow(r: Row): SalaryProfile {
  return {
    yearlySalary: Number(r.yearly_salary),
    taxPct: Number(r.tax_pct),
    halfTaxPct: Number(r.half_tax_pct),
    vacationRatePct: Number(r.vacation_rate_pct),
    feriepengerMonth: r.feriepenger_month,
    halfTaxMonth: r.half_tax_month,
    workdaysPerMonth: Number(r.workdays_per_month),
    vacationDays: Number(r.vacation_days),
    deductionDays: Number(r.deduction_days),
  }
}

function toRow(p: SalaryProfile): Row {
  return {
    yearly_salary: p.yearlySalary,
    tax_pct: p.taxPct,
    half_tax_pct: p.halfTaxPct,
    vacation_rate_pct: p.vacationRatePct,
    feriepenger_month: p.feriepengerMonth,
    half_tax_month: p.halfTaxMonth,
    workdays_per_month: p.workdaysPerMonth,
    vacation_days: p.vacationDays,
    deduction_days: p.deductionDays,
  }
}

export async function fetchSalaryProfile(): Promise<SalaryProfile | null> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from("salary_settings")
    .select("*")
    .maybeSingle()
  if (error) throw error
  return data ? fromRow(data as Row) : null
}

export async function saveSalaryProfile(p: SalaryProfile): Promise<void> {
  const supabase = getSupabase()
  const { error } = await supabase
    .from("salary_settings")
    .upsert(toRow(p), { onConflict: "user_id" })
  if (error) throw error
}

/** Find the income entry flagged as the salary row, creating it if missing. */
export async function ensureSalaryEntry(): Promise<Entry> {
  const supabase = getSupabase()
  const { data: existing, error: findErr } = await supabase
    .from("entries")
    .select("*")
    .eq("kind", "income")
    .eq("is_salary", true)
    .limit(1)
    .maybeSingle()
  if (findErr) throw findErr
  if (existing) return existing as Entry

  const { data, error } = await supabase
    .from("entries")
    .insert({
      kind: "income",
      name: "Salary",
      category_id: null,
      method_id: null,
      due_day: 15,
      is_recurring: false,
      default_amount: 0,
      is_active: true,
      is_salary: true,
      sort_order: 0,
    })
    .select("*")
    .single()
  if (error) throw error
  return data as Entry
}
