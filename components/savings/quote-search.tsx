"use client"

import { useDeferredValue, useState } from "react"
import useSWR from "swr"
import { Loader2, Search } from "lucide-react"

import { cn } from "@/lib/utils"
import { searchQuotes, type QuoteResult } from "@/lib/savings/market"
import { Input } from "@/components/ui/input"

const TYPE_LABEL: Record<string, string> = {
  MUTUALFUND: "Fund",
  ETF: "ETF",
  EQUITY: "Stock",
  INDEX: "Index",
}

/** Search stocks and funds by name or ticker; pick one to link a holding to it. */
export function QuoteSearch({
  selected,
  onPick,
}: {
  selected: string | null
  onPick: (quote: QuoteResult) => void
}) {
  const [query, setQuery] = useState("")
  const q = useDeferredValue(query.trim())
  const { data, error, isLoading } = useSWR(q.length >= 2 ? ["quote-search", q] : null, () => searchQuotes(q), {
    revalidateOnFocus: false,
    keepPreviousData: true,
  })

  return (
    <div className="flex flex-col gap-1.5">
      <div className="relative">
        <Search className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
        <Input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search a stock or fund, e.g. KLP AksjeGlobal, Equinor"
          className="pl-8"
        />
        {isLoading && (
          <Loader2 className="text-muted-foreground absolute top-1/2 right-2.5 size-4 -translate-y-1/2 animate-spin" />
        )}
      </div>
      {error && (
        <p className="text-destructive text-xs">
          Search isn&apos;t available: {error instanceof Error ? error.message : "unknown error"}. Is the
          &quot;quotes&quot; function deployed in Supabase?
        </p>
      )}
      {q.length >= 2 && data && (
        <ul className="max-h-60 divide-y overflow-y-auto border">
          {data.length === 0 && (
            <li className="text-muted-foreground px-3 py-2 text-sm">No matches.</li>
          )}
          {data.map((r) => (
            <li key={r.symbol}>
              <button
                type="button"
                onClick={() => onPick(r)}
                className={cn(
                  "hover:bg-muted flex w-full items-center gap-3 px-3 py-2 text-left",
                  selected === r.symbol && "bg-primary/10",
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{r.name}</span>
                  <span className="text-muted-foreground text-xs">
                    {r.symbol} · {r.exchange}
                  </span>
                </span>
                <span className="text-muted-foreground border px-1.5 text-[10px] tracking-wide uppercase">
                  {TYPE_LABEL[r.type] ?? r.type}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
