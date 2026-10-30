"use client"

import { useState } from "react"
import useSWR from "swr"

import type { Category } from "@/lib/types"
import {
  fetchBankTypeCategories,
  type BankTypeCategory,
} from "@/lib/data/categories"
import { useCategories } from "@/lib/data/use-budget"
import { Button } from "@/components/ui/button"
import {
  DeleteCategoryDialog,
  MergeDialog,
} from "@/components/settings/category-dialogs"

/**
 * One-time cleanup: imports used to create a category per bank "Type"
 * (Varekjøp, Avtalegiro…). Fold each into a real category, or delete it.
 */
export function BankTypeCleanup({ onChanged }: { onChanged: () => void }) {
  const { data = [], mutate } = useSWR("bank-type-categories", fetchBankTypeCategories)
  const { categories } = useCategories()
  const [merge, setMerge] = useState<BankTypeCategory | null>(null)
  const [remove, setRemove] = useState<BankTypeCategory | null>(null)

  if (data.length === 0) {
    return null
  }
  const done = () => {
    mutate()
    onChanged()
  }
  const live = (b: BankTypeCategory | null): Category | null =>
    b ? (categories.find((c) => c.id === b.category.id) ?? b.category) : null

  return (
    <div className="flex flex-col border border-amber-500/40">
      <div className="border-b bg-amber-500/5 px-3 py-2">
        <div className="text-sm font-semibold">Bank-type categories</div>
        <p className="text-muted-foreground text-xs">
          Older imports made a category for each bank type. Merge each into a real
          category (its transactions, rules and mappings follow), or delete it.
        </p>
      </div>
      <div className="flex flex-col divide-y">
        {data.map((b) => (
          <div
            key={b.category.id}
            className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2"
          >
            <span className="min-w-0 flex-1 truncate text-sm font-medium">
              {b.category.name}
            </span>
            <span className="text-muted-foreground text-xs tabular-nums">
              {b.transactions} tx · {b.mappedTransactions} via mapping · {b.rules} rules ·{" "}
              {b.mappings} mappings{b.entries > 0 && ` · ${b.entries} budget rows`}
            </span>
            <div className="flex gap-1.5">
              <Button size="sm" variant="outline" onClick={() => setMerge(b)}>
                Merge into…
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setRemove(b)}>
                Delete…
              </Button>
            </div>
          </div>
        ))}
      </div>
      <MergeDialog
        source={live(merge)}
        categories={categories}
        onClose={() => setMerge(null)}
        onDone={done}
      />
      <DeleteCategoryDialog
        target={live(remove)}
        categories={categories}
        onClose={() => setRemove(null)}
        onDone={done}
      />
    </div>
  )
}
