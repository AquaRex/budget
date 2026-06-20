// Salary calculation, matching the user's Excel formulas.
//
//   monthlyBeforeTax   = yearlySalary / 12
//   monthlyAfterTax    = monthlyBeforeTax * (1 - tax%)
//   monthlyAfterHalfTax= monthlyBeforeTax * (1 - (tax%/2))  (half the rate)
//   vacationBasis      = monthlyBeforeTax * (12 - vacationDays/workdaysPerMonth)
//   feriepenger        = vacationBasis * vacationRate%
//                        - (monthlyBeforeTax / workdaysPerMonth) * deductionDays
//
// Net cash hitting the account per month:
//   - feriepenger month  -> feriepenger (untaxed; replaces salary)
//   - half-tax month      -> monthlyAfterHalfTax
//   - every other month   -> monthlyAfterTax

export type SalaryProfile = {
  yearlySalary: number
  taxPct: number
  halfTaxPct: number
  vacationRatePct: number
  feriepengerMonth: number // 1-12
  halfTaxMonth: number // 1-12
  workdaysPerMonth: number
  vacationDays: number
  deductionDays: number
}

export function defaultSalaryProfile(): SalaryProfile {
  return {
    yearlySalary: 0,
    taxPct: 29,
    halfTaxPct: 14.5,
    vacationRatePct: 12,
    feriepengerMonth: 6,
    halfTaxMonth: 11,
    workdaysPerMonth: 26,
    vacationDays: 25,
    deductionDays: 4,
  }
}

export type SalaryResult = {
  monthlyBeforeTax: number
  monthlyAfterTax: number
  monthlyAfterHalfTax: number
  vacationBasis: number
  feriepenger: number
  yearlyBeforeTax: number
  yearlyAfterTax: number
  yearlyAfterTaxAndVacation: number
}

export function computeSalary(p: SalaryProfile): SalaryResult {
  const monthlyBeforeTax = p.yearlySalary / 12
  const monthlyAfterTax = monthlyBeforeTax * (1 - p.taxPct / 100)
  // Half-tax month is always taxed at half the regular rate.
  const monthlyAfterHalfTax = monthlyBeforeTax * (1 - p.taxPct / 2 / 100)
  const vacationBasis =
    monthlyBeforeTax * (12 - p.vacationDays / p.workdaysPerMonth)
  const feriepenger =
    vacationBasis * (p.vacationRatePct / 100) -
    (monthlyBeforeTax / p.workdaysPerMonth) * p.deductionDays

  return {
    monthlyBeforeTax,
    monthlyAfterTax,
    monthlyAfterHalfTax,
    vacationBasis,
    feriepenger,
    yearlyBeforeTax: p.yearlySalary,
    // 10 normal months + half-tax month + feriepenger month.
    yearlyAfterTax: monthlyAfterTax * 11 + monthlyAfterHalfTax,
    yearlyAfterTaxAndVacation:
      monthlyAfterTax * 10 + monthlyAfterHalfTax + feriepenger,
  }
}

/** Net amount the salary row contributes for a given month (1-12). */
export function salaryMonthlyNet(p: SalaryProfile, month: number): number {
  const r = computeSalary(p)
  if (month === p.feriepengerMonth) return r.feriepenger
  if (month === p.halfTaxMonth) return r.monthlyAfterHalfTax
  return r.monthlyAfterTax
}

/** Reverse: derive yearly-before-tax from a target monthly-after-tax amount. */
export function yearlyFromMonthlyAfterTax(
  monthlyAfterTax: number,
  taxPct: number,
): number {
  if (taxPct >= 100) return 0
  return (monthlyAfterTax / (1 - taxPct / 100)) * 12
}
