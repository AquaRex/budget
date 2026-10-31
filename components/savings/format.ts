import { MONTHS_SHORT } from "@/lib/budget"
import { monthOf, yearOf } from "@/lib/savings/compute"
import type { HoldingKind } from "@/lib/savings/types"
import { isDemoMode, MASK } from "@/lib/demo-mode"

const units = new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 4 })
const price = new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 2 })

export const formatUnits = (n: number) =>
  isDemoMode() ? MASK : units.format(n)
export const formatUnitsShort = (n: number) =>
  isDemoMode() ? MASK : price.format(n)
export const formatPrice = (n: number) => `${formatUnitsShort(n)} kr`
export const monthLabel = (index: number) =>
  `${MONTHS_SHORT[monthOf(index) - 1]} ${yearOf(index)}`

export const KIND_LABEL: Record<HoldingKind, string> = {
  fund: "Fund",
  stock: "Stock",
  plan: "Share plan",
}

/** "12,5" / "12 000" / "" → number, or null when empty or invalid. */
export function parseNumber(raw: string): number | null {
  const clean = raw.trim().replace(/\s/g, "").replace(",", ".")
  if (clean === "") {
    return null
  }
  const n = Number(clean)
  return Number.isFinite(n) && n >= 0 ? n : null
}
