const nok = new Intl.NumberFormat("nb-NO", {
  style: "currency",
  currency: "NOK",
  maximumFractionDigits: 0,
})

const nokWithDecimals = new Intl.NumberFormat("nb-NO", {
  style: "currency",
  currency: "NOK",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/** Format a number as Norwegian kroner, e.g. 12500 -> "12 500 kr". */
export function formatNOK(amount: number, withDecimals = false): string {
  return (withDecimals ? nokWithDecimals : nok).format(amount || 0)
}

const number0 = new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 0 })

/** Plain grouped number without a currency symbol, e.g. 12500 -> "12 500". */
export function formatNumber(amount: number): string {
  return number0.format(Math.round(amount || 0))
}

/** Ordinal-ish label for a day of the month, e.g. 1 -> "the 1st". */
export function dayLabel(day: number): string {
  const j = day % 10
  const k = day % 100
  let suffix = "th"
  if (j === 1 && k !== 11) suffix = "st"
  else if (j === 2 && k !== 12) suffix = "nd"
  else if (j === 3 && k !== 13) suffix = "rd"
  return `${day}${suffix}`
}
