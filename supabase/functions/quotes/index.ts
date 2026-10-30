// Market data for the Savings tab. Yahoo Finance has no CORS, so the site asks
// this function instead. Two requests, both JSON POST:
//   { "search": "klp aksje" }        → { results: [{ symbol, name, type, exchange }] }
//   { "history": "0P00018V9L.IR" }   → { symbol, name, currency, price, points: [{ year, month, close }] }
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
    return json({ error: "send { search } or { history }" }, 400)
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "failed" }, 502)
  }
})
