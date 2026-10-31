// Market data for the Savings tab. Yahoo Finance has no CORS, so the site asks
// this function instead. Three requests, all JSON POST:
//   { "search": "klp aksje" }        → { results: [{ symbol, name, type, exchange }] }
//   { "history": "0P00018V9L.IR" }   → { symbol, name, currency, price, points: [{ year, month, close }] }
//   { "quote": "EQNR.OL", "date": "2026-03-14", "time": "14:30" }
//                                    → { symbol, currency, price, date, time, source: "intraday" | "daily" }
// Deploy with JWT verification on (the default), so only signed-in users can call it.

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}
const yahoo = { "User-Agent": "Mozilla/5.0" }

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } })

async function search(q: string) {
  const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=12&newsCount=0`
  const res = await fetch(url, { headers: yahoo })
  if (!res.ok) {
    throw new Error(`search failed (${res.status})`)
  }
  const data = await res.json()
  const results = (data.quotes ?? [])
    .filter((x: { quoteType?: string }) => ["EQUITY", "ETF", "MUTUALFUND", "INDEX"].includes(x.quoteType ?? ""))
    .map((x: Record<string, string>) => ({
      symbol: x.symbol,
      name: x.longname || x.shortname || x.symbol,
      type: x.quoteType,
      exchange: x.exchDisp || x.exchange,
    }))
  return { results }
}

async function history(symbol: string) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=max&interval=1mo`
  const res = await fetch(url, { headers: yahoo })
  if (!res.ok) {
    throw new Error(`history failed (${res.status})`)
  }
  const data = await res.json()
  const r = data.chart?.result?.[0]
  if (!r) {
    throw new Error("unknown symbol")
  }
  const closes: (number | null)[] = r.indicators?.quote?.[0]?.close ?? []
  // Bars start at local midnight on the 1st (still the previous month in UTC),
  // and the current month can repeat with intraday stamps: read each stamp in
  // the exchange's time zone and keep the latest close per month.
  const local = new Intl.DateTimeFormat("en-US", {
    timeZone: r.meta?.exchangeTimezoneName ?? "UTC",
    year: "numeric",
    month: "numeric",
  })
  const byMonth = new Map<string, { year: number; month: number; close: number }>()
  ;(r.timestamp ?? []).forEach((t: number, i: number) => {
    const close = closes[i]
    if (close == null) {
      return
    }
    const parts = local.formatToParts(new Date(t * 1000))
    const year = Number(parts.find((p) => p.type === "year")?.value)
    const month = Number(parts.find((p) => p.type === "month")?.value)
    byMonth.set(`${year}-${month}`, { year, month, close })
  })
  const points = [...byMonth.values()]
  return {
    symbol,
    name: r.meta?.longName ?? r.meta?.shortName ?? symbol,
    currency: r.meta?.currency ?? null,
    price: r.meta?.regularMarketPrice ?? null,
    points,
  }
}

type Bar = { date: string; time: string; close: number }

async function bars(symbol: string, from: number, to: number, interval: string) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${from}&period2=${to}&interval=${interval}`
  const res = await fetch(url, { headers: yahoo })
  if (!res.ok) {
    throw new Error(`price lookup failed (${res.status})`)
  }
  const r = (await res.json()).chart?.result?.[0]
  if (!r) {
    throw new Error("unknown symbol")
  }
  // Stamps read in the exchange's own time zone, as the owner thinks of them.
  const local = new Intl.DateTimeFormat("en-CA", {
    timeZone: r.meta?.exchangeTimezoneName ?? "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  })
  const closes: (number | null)[] = r.indicators?.quote?.[0]?.close ?? []
  const out: Bar[] = []
  ;(r.timestamp ?? []).forEach((t: number, i: number) => {
    const close = closes[i]
    if (close == null) {
      return
    }
    const p = Object.fromEntries(local.formatToParts(new Date(t * 1000)).map((x) => [x.type, x.value]))
    out.push({ date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}`, close })
  })
  return { currency: (r.meta?.currency ?? null) as string | null, bars: out }
}

/**
 * Price at a moment: with a time, the last intraday bar at or before it (5-min
 * bars reach back ~60 days, hourly ~2 years; funds only have a daily price);
 * otherwise, or before that day's open, the latest daily close on or before the date.
 */
async function quoteAt(symbol: string, date: string, time: string | null) {
  const day = Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10))) / 1000
  const ageDays = (Date.now() / 1000 - day) / 86_400
  const interval = !time ? null : ageDays <= 55 ? "5m" : ageDays <= 700 ? "60m" : null
  if (interval && time) {
    const intraday = await bars(symbol, day - 86_400, day + 2 * 86_400, interval)
    const sameDay = intraday.bars.filter((b) => b.date === date)
    const hit = sameDay.filter((b) => b.time <= time).at(-1)
    // A single bar is a fund's daily price, not a time of day: fall through to daily.
    if (hit && sameDay.length > 1) {
      return { symbol, currency: intraday.currency, price: hit.close, date, time: hit.time, source: "intraday" }
    }
    if (sameDay.length > 1) {
      // Bought before the open: the price then was the previous close.
      const daily = await bars(symbol, day - 10 * 86_400, day + 86_400, "1d")
      const prev = daily.bars.filter((b) => b.date < date).at(-1)
      if (prev) {
        return { symbol, currency: daily.currency, price: prev.close, date: prev.date, time: null, source: "daily" }
      }
    }
  }
  const daily = await bars(symbol, day - 10 * 86_400, day + 2 * 86_400, "1d")
  const hit = daily.bars.filter((b) => b.date <= date).at(-1)
  if (!hit) {
    throw new Error(`no price on or before ${date}`)
  }
  return { symbol, currency: daily.currency, price: hit.close, date: hit.date, time: null, source: "daily" }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors })
  }
  try {
    const body = await req.json()
    if (typeof body.search === "string" && body.search.trim()) {
      return json(await search(body.search.trim()))
    }
    if (typeof body.history === "string" && body.history.trim()) {
      return json(await history(body.history.trim()))
    }
    if (typeof body.quote === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.date ?? "")) {
      const time = typeof body.time === "string" && /^\d{2}:\d{2}$/.test(body.time) ? body.time : null
      return json(await quoteAt(body.quote.trim(), body.date, time))
    }
    return json({ error: "send { search }, { history } or { quote, date }" }, 400)
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "failed" }, 502)
  }
})
