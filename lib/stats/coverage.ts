import type { ImportBatch, Transaction } from "@/lib/types"
import { effectiveDate } from "@/lib/spending"
import type { MonthStatus } from "@/lib/stats/types"
import { addDays, daysInMonth, dayKey, isoDate } from "@/lib/stats/dates"

// The date window the imported bank data fully covers (inclusive).
export type Coverage = { start: string | null; through: string | null }

const FIXED_BANK_HOLIDAYS = new Set(["01-01", "05-01", "05-17", "12-25", "12-26"])

function isNonBankingDay(date: string): boolean {
  const [y, m, d] = date.split("-").map(Number)
  const weekday = new Date(y, m - 1, d).getDay()
  return weekday === 0 || weekday === 6 || FIXED_BANK_HOLIDAYS.has(date.slice(5))
}

/**
 * Bank exports are ranged by booking date, so the earliest booked row marks
 * where the data begins (bought-mode rows dated earlier are spill-over from a
 * partly covered month). An export from the 1st usually has its first booking
 * a few days later (weekend, New Year), so when no banking day precedes the
 * earliest booking, the whole month counts as covered.
 */
function coverageStart(transactions: Transaction[]): string | null {
  let earliest: string | null = null
  for (const t of transactions) {
    if (!earliest || t.booked_date < earliest) {
      earliest = t.booked_date
    }
  }
  if (!earliest) {
    return null
  }
  const monthStart = `${earliest.slice(0, 8)}01`
  for (let d = monthStart; d < earliest; d = addDays(d, 1)) {
    if (!isNonBankingDay(d)) {
      return earliest
    }
  }
  return monthStart
}

const IMPORT_REACH_DAYS = 7

/** A pending row's booked_date can be a future due date; only its purchase date is proof of data. */
function activityDate(t: Transaction): string | null {
  return t.is_booked ? effectiveDate(t) : t.tx_date
}

/**
 * The last day the data is complete through: the latest row, extended to the
 * day before an upload (the upload day itself was still in progress) when that
 * import's own new rows reach within a week of it. Re-uploading an old CSV adds
 * no recent rows, so it can't mark unseen days as covered. Capped at today.
 */
function coverageThrough(
  transactions: Transaction[],
  imports: ImportBatch[],
  today: string,
): string | null {
  let through = ""
  const latestByImport = new Map<string, string>()
  for (const t of transactions) {
    const d = activityDate(t)
    if (!d) {
      continue
    }
    if (d > through) {
      through = d
    }
    if (t.import_id && d > (latestByImport.get(t.import_id) ?? "")) {
      latestByImport.set(t.import_id, d)
    }
  }
  for (const batch of imports) {
    const uploadedThrough = addDays(isoDate(new Date(batch.uploaded_at)), -1)
    const latestOwn = latestByImport.get(batch.id)
    const reachesUpload = !!latestOwn && latestOwn >= addDays(uploadedThrough, -IMPORT_REACH_DAYS)
    if (reachesUpload && uploadedThrough > through) {
      through = uploadedThrough
    }
  }
  if (!through) {
    return null
  }
  return through > today ? today : through
}

export function computeCoverage(
  transactions: Transaction[],
  imports: ImportBatch[],
  today: string,
): Coverage {
  return {
    start: coverageStart(transactions),
    through: coverageThrough(transactions, imports, today),
  }
}

/**
 * `rowCount` is every row (incl. internal) dated in the month: a covered month
 * with no rows at all means a gap between imports, not a month without money.
 */
export function monthStatus(
  year: number,
  month: number,
  coverage: Coverage,
  today: string,
  rowCount: number,
): MonthStatus {
  const first = dayKey(year, month, 1)
  const last = dayKey(year, month, daysInMonth(year, month))
  if (first > today) {
    return "future"
  }
  if (today <= last) {
    return "current"
  }
  const { start, through } = coverage
  if (!start || !through || rowCount === 0 || through < first || start > last) {
    return "no-data"
  }
  if (start <= first && through >= last) {
    return "complete"
  }
  return "partial"
}
