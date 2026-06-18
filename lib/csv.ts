// Parser for Norwegian bank transaction CSVs (semicolon separated), e.g.:
//   Bokført;Rentedato;Transaksjonstidspunkt;Type;Beskrivelse;Melding;
//   Ut av konto;Inn på konto;Valutasort;Fra konto;Til konto
//
// Amounts use a NBSP/space thousands separator, a decimal comma, and a unicode
// minus (U+2212) for money out. Money out lives in "Ut av konto", money in in
// "Inn på konto". We store a single signed amount: negative = spending.

export type ParsedTx = {
  booked_date: string // ISO yyyy-mm-dd
  tx_date: string | null
  type: string | null
  description: string | null
  message: string | null
  amount: number
  currency: string
  from_account: string | null
  to_account: string | null
  is_internal: boolean
  dedup_key: string
  identity_key: string
}

export type ParseResult = {
  rows: ParsedTx[]
  skipped: number
  total: number
}

/** Read a File as text, falling back to windows-1252 if UTF-8 looks mojibaked. */
export async function readCsvFile(file: File): Promise<string> {
  const buf = await file.arrayBuffer()
  let text = new TextDecoder("utf-8").decode(buf)
  // Telltale UTF-8-as-Latin-1 garble ("Ã¸" = ø, "Ã¦" = æ, "Ã…" = Å).
  if (/Ã.|Â./.test(text) && !/ø|æ|å/i.test(text)) {
    try {
      text = new TextDecoder("windows-1252").decode(buf)
    } catch {
      // keep the UTF-8 attempt
    }
  }
  return text.replace(/^﻿/, "") // strip BOM
}

// Minimal CSV row splitter (handles quoted fields, though this format rarely
// quotes). Splits on the given delimiter.
function splitLine(line: string, delim: string): string[] {
  const out: string[] = []
  let cur = ""
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (ch === delim && !inQuotes) {
      out.push(cur)
      cur = ""
    } else {
      cur += ch
    }
  }
  out.push(cur)
  return out
}

/** "1 234,50", "−500,00", "1 000,00" -> number (NaN if blank/invalid). */
function parseAmount(raw: string): number {
  const s = (raw ?? "")
    .replace(/[\s ]/g, "")
    .replace(/−/g, "-") // unicode minus
    .replace(/\./g, "") // any stray thousands dot
    .replace(/,/g, ".")
  if (s === "") return NaN
  const n = Number(s)
  return Number.isFinite(n) ? n : NaN
}

/** "18.06.2026" or "18.06.2026 10.02" -> "2026-06-18" (null if unparseable). */
function parseDate(raw: string): string | null {
  const m = (raw ?? "").trim().match(/^(\d{2})\.(\d{2})\.(\d{4})/)
  if (!m) return null
  return `${m[3]}-${m[2]}-${m[1]}`
}

// Small stable string hash (djb2) -> base36, for dedup across re-uploads.
function hashKey(parts: (string | number | null)[]): string {
  const s = parts.map((p) => (p == null ? "" : String(p))).join("|")
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0
  return h.toString(36)
}

function headerIndex(headers: string[], ...needles: string[]): number {
  const norm = headers.map((h) => h.toLowerCase().trim())
  for (const n of needles) {
    const i = norm.findIndex((h) => h.includes(n))
    if (i !== -1) return i
  }
  return -1
}

export function parseBankCsv(text: string): ParseResult {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "")
  if (lines.length < 2) return { rows: [], skipped: 0, total: 0 }

  const delim = lines[0].includes(";") ? ";" : ","
  const headers = splitLine(lines[0], delim)

  const iBooked = headerIndex(headers, "bokf")
  const iTx = headerIndex(headers, "transaksjonstid")
  const iType = headerIndex(headers, "type")
  const iDesc = headerIndex(headers, "beskriv")
  const iMsg = headerIndex(headers, "melding")
  const iOut = headerIndex(headers, "ut av")
  const iIn = headerIndex(headers, "inn p")
  const iCur = headerIndex(headers, "valuta")
  const iFrom = headerIndex(headers, "fra konto")
  const iTo = headerIndex(headers, "til konto")

  const rows: ParsedTx[] = []
  let skipped = 0
  let total = 0

  for (let li = 1; li < lines.length; li++) {
    total++
    const c = splitLine(lines[li], delim)
    const get = (i: number) => (i >= 0 ? (c[i] ?? "").trim() : "")

    const booked = parseDate(get(iBooked))
    if (!booked) {
      skipped++
      continue
    }
    const out = parseAmount(get(iOut))
    const inn = parseAmount(get(iIn))
    let amount = 0
    if (!Number.isNaN(out)) amount = out > 0 ? -out : out // "out" is the money leaving
    else if (!Number.isNaN(inn)) amount = Math.abs(inn)
    else {
      skipped++
      continue
    }

    const type = get(iType) || null
    const description = get(iDesc) || null
    const message = get(iMsg) || null
    const from_account = get(iFrom) || null
    const to_account = get(iTo) || null
    const tx_date = parseDate(get(iTx))
    const currency = get(iCur) || "NOK"

    // A transfer between your own accounts isn't real spending. These appear as
    // "Overføring" / "Overført fra …" / "… mellom egne kontoer" / "Nettbank",
    // often with only one account column filled.
    const internalHay = `${type ?? ""} ${description ?? ""} ${message ?? ""}`
      .toLowerCase()
    const isInternal =
      internalHay.includes("overf") ||
      internalHay.includes("mellom egne kontoer") ||
      internalHay.includes("nettbank")

    // Identity ignores amount + booking date so a pending card charge that
    // later settles (re-priced / re-booked) matches its earlier version. For
    // card purchases the transaction timestamp is the stable anchor; transfers
    // (no timestamp) keep the amount in the identity since they don't re-price.
    const identityParts = tx_date
      ? [tx_date, description, currency, from_account, to_account]
      : [booked, type, message, from_account, to_account, amount]

    rows.push({
      booked_date: booked,
      tx_date,
      type,
      description,
      message,
      amount,
      currency,
      from_account,
      to_account,
      is_internal: isInternal,
      dedup_key: hashKey([
        booked,
        tx_date,
        amount,
        description,
        message,
        from_account,
        to_account,
        type,
      ]),
      identity_key: hashKey(identityParts),
    })
  }

  return { rows, skipped, total }
}

export async function parseBankCsvFile(file: File): Promise<ParseResult> {
  const text = await readCsvFile(file)
  return parseBankCsv(text)
}
