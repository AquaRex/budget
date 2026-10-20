// Local-time calendar helpers on "YYYY-MM-DD" strings (string order = date order).

export const pad2 = (n: number) => String(n).padStart(2, "0")

export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

export function ymKey(year: number, month: number): string {
  return `${year}-${pad2(month)}`
}

export function dayKey(year: number, month: number, day: number): string {
  return `${ymKey(year, month)}-${pad2(day)}`
}

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number)
  return isoDate(new Date(y, m - 1, d + days))
}

export type YearMonth = { year: number; month: number }

export function shiftMonth(year: number, month: number, offset: number): YearMonth {
  const index = year * 12 + (month - 1) + offset
  return { year: Math.floor(index / 12), month: (index % 12) + 1 }
}
