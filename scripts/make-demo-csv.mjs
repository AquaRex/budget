// Turn a real bank CSV into a demo one:
//   • drop debt / loan / collection rows (mortgage, student loan, Resurs,
//     Santander, Avida, Intrum, Axactor, Zolva, Svea, Riverty, Fair…)
//   • reduce every amount by 20%, then jitter ±10% so figures aren't a clean
//     multiple (magnitudes stay realistic — a 49 kr item never becomes 4 500).
//
// Usage:  node scripts/make-demo-csv.mjs <input.csv> > demo.csv
import { readFileSync } from "node:fs"

const inPath = process.argv[2]
if (!inPath) {
  console.error("usage: node scripts/make-demo-csv.mjs <input.csv> > demo.csv")
  process.exit(1)
}

let text = readFileSync(inPath, "utf8").replace(/^﻿/, "")
const lines = text.split(/\r?\n/)
const header = lines[0]
const rows = lines.slice(1).filter((l) => l.trim() !== "")

// Columns: 0 Bokført 1 Rentedato 2 Tx 3 Type 4 Beskrivelse 5 Melding
//          6 Ut 7 Inn 8 Valuta 9 Fra 10 Til
const isDebt = (f) => {
  const type = (f[3] ?? "").trim().toLowerCase()
  const hay = [f[3], f[4], f[5], f[10]].join(" ").toLowerCase()
  const til = (f[10] ?? "").trim()
  if (type === "lån") return true
  if (til === "36211582477") return true // the mortgage/loan account
  return [
    "lånekas", // Statens Lånekassen (student loan)
    "resurs bank",
    "santander consumer",
    "avida finans",
    "intrum",
    "axactor",
    "zolva",
    "svea finans",
    "riverty",
    "fair.no",
    "fair collection",
  ].some((p) => hay.includes(p))
}

// Private person-to-person payments (named individuals), removed for the demo.
const isPrivate = (f) => {
  const type = (f[3] ?? "").trim().toLowerCase()
  if (type === "straksbetaling" || type === "vipps") return true
  // Names are matched on the Beskrivelse only, so "Thomas Hetland, 22D" sitting
  // in the *message* of the housing/HOA payment doesn't drop that bill.
  const desc = (f[4] ?? "").toLowerCase()
  return [
    /hetland/, /\bgram\b/, /skjæveland/, /skjaevela/, /gina-linn/, /sondre/,
    /helgevold/, /\bsimen\b/, /takvam/, /berntsen/, /mamady/, /sangare/,
    /\bngo\b/, /joakim/, /\baase\b/, /solfrid/, /\bsander\b/, /sindre/,
    /fylkesnes/, /robin henrik/,
  ].some((re) => re.test(desc))
}

/** "1 234,50" / "−500,00" -> { value, neg } (handles NBSP + unicode minus). */
function parseNum(s) {
  const raw = (s ?? "").trim()
  if (raw === "") return null
  const neg = /[−-]/.test(raw)
  const n = Number(
    raw
      .replace(/[\s ]/g, "")
      .replace(/[−-]/g, "")
      .replace(/\./g, "")
      .replace(/,/g, "."),
  )
  return Number.isFinite(n) ? { value: n, neg } : null
}

/** number -> "1 234,50" (NBSP thousands, comma decimal), keeping the sign. */
function formatNum(value, neg) {
  const fixed = value.toFixed(2)
  const [int, frac] = fixed.split(".")
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, " ")
  return `${neg ? "−" : ""}${grouped},${frac}`
}

function scramble(cell) {
  const p = parseNum(cell)
  if (!p || p.value === 0) return cell
  const factor = 0.8 * (0.9 + Math.random() * 0.2) // −20%, then ±10%
  return formatNum(Math.round(p.value * factor * 100) / 100, p.neg)
}

const out = [header]
let kept = 0
let dropped = 0
for (const line of rows) {
  const f = line.split(";")
  if (isDebt(f) || isPrivate(f)) {
    dropped++
    continue
  }
  f[6] = scramble(f[6]) // Ut av konto
  f[7] = scramble(f[7]) // Inn på konto
  out.push(f.join(";"))
  kept++
}

process.stderr.write(`kept ${kept} rows, dropped ${dropped} debt rows\n`)
process.stdout.write("﻿" + out.join("\r\n") + "\r\n")
