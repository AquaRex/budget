"use client"

import { useMemo, useState } from "react"
import { AlertTriangle } from "lucide-react"
import { toast } from "sonner"
import { useSWRConfig } from "swr"

import type { Category } from "@/lib/types"
import { buildTypeMap, effectiveCategoryId } from "@/lib/spending"
import {
  useEntryCounts,
  useTransactions,
  useTxRules,
  useTypeCategories,
} from "@/lib/data/use-budget"
import {
  deleteCategory,
  deleteGroup,
  mergeCategories,
} from "@/lib/data/categories"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { CategorySelect } from "@/components/spending/category-picker"

/** What still points at a category, for spelling out a merge or delete. */
export type CategoryUsage = {
  transactions: number // placed on it, explicitly or via a bank-type mapping
  rules: number
  mappings: number // bank types mapped to it
  entries: number // budget rows in every year (groups only)
  entryYears: string // e.g. "2025–2026", "" when none
  members: number // categories inside it (groups only)
}

/** "2025" or "2024–2026": the years that hold budget rows. */
export function yearSpan(byYear: Record<number, number> | undefined): string {
  const years = Object.entries(byYear ?? {})
    .filter(([, n]) => n > 0)
    .map(([y]) => Number(y))
    .sort((a, b) => a - b)
  if (years.length === 0) {
    return ""
  }
  return years.length === 1 ? String(years[0]) : `${years[0]}–${years[years.length - 1]}`
}

/** "3 budget rows across 2025–2026" — every year, since moves touch them all. */
export function budgetRowsLabel(usage: CategoryUsage): string {
  const rows = plural(usage.entries, "budget row")
  return usage.entryYears ? `${rows} across ${usage.entryYears}` : rows
}

/** Counts what points at `c`, so the dialogs can say what will move. */
function useCategoryUsage(c: Category | null, categories: Category[]): CategoryUsage {
  const { transactions } = useTransactions()
  const { rules } = useTxRules()
  const { typeCategories } = useTypeCategories()
  const { counts } = useEntryCounts()
  return useMemo(() => {
    if (!c) {
      return { transactions: 0, rules: 0, mappings: 0, entries: 0, entryYears: "", members: 0 }
    }
    const entryCount = counts.get(c.id)
    const typeMap = buildTypeMap(typeCategories)
    return {
      transactions: transactions.filter((t) => effectiveCategoryId(t, typeMap) === c.id).length,
      rules: rules.filter((r) => r.category_id === c.id).length,
      mappings: typeCategories.filter((m) => m.category_id === c.id).length,
      entries: entryCount?.total ?? 0,
      entryYears: yearSpan(entryCount?.byYear),
      members: categories.filter((m) => !m.is_group && m.group_id === c.id).length,
    }
  }, [c, categories, transactions, rules, typeCategories, counts])
}

export const plural = (n: number, word: string) =>
  `${n} ${n === 1 ? word : word.endsWith("y") ? `${word.slice(0, -1)}ies` : `${word}s`}`

/** Whether money placed in this category counts as saved rather than spent. */
function isSavingsCategory(c: Category, categories: Category[]): boolean {
  if (c.is_group) {
    return c.is_savings
  }
  return categories.find((g) => g.id === c.group_id)?.is_savings ?? false
}

function SavingsWarning({
  from,
  to,
  categories,
}: {
  from: Category
  to: Category | undefined
  categories: Category[]
}) {
  if (!to) {
    return null
  }
  const fromSaved = isSavingsCategory(from, categories)
  if (fromSaved === isSavingsCategory(to, categories)) {
    return null
  }
  return (
    <p className="flex gap-2 border border-amber-500/40 bg-amber-500/5 p-2.5 text-xs">
      <AlertTriangle className="size-4 shrink-0 text-amber-600" />
      <span>
        {fromSaved
          ? `Money in ${from.name} counts as saved today. In ${to.name} it will count as spending,`
          : `Money in ${from.name} counts as spending today. In ${to.name} it will count as saved,`}{" "}
        so spending, the savings rate and the Groups totals change.
      </span>
    </p>
  )
}

export function MergeDialog({
  source,
  categories,
  onClose,
  onDone,
}: {
  source: Category | null
  categories: Category[]
  onClose: () => void
  onDone: () => void
}) {
  const usage = useCategoryUsage(source, categories)
  const [target, setTarget] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const { mutate } = useSWRConfig()
  const into = categories.find((c) => c.id === target)
  const close = () => {
    setTarget(null)
    onClose()
  }

  async function merge() {
    if (!source || !target) {
      return
    }
    setBusy(true)
    try {
      await mergeCategories(source.id, target)
      toast.success(`Merged ${source.name} into ${into?.name}.`)
      mutate("entry_counts")
      onDone()
      close()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not merge.")
    } finally {
      setBusy(false)
    }
  }

  const moved = [
    plural(usage.transactions, "transaction"),
    plural(usage.rules, "merchant rule"),
    plural(usage.mappings, "bank-type mapping"),
    source?.is_group && budgetRowsLabel(usage),
    source?.is_group && plural(usage.members, "category"),
  ].filter(Boolean)

  return (
    <Dialog open={!!source} onOpenChange={(o) => !o && close()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Merge {source?.name}</DialogTitle>
          <DialogDescription>
            Everything in {source?.name} moves into the {source?.is_group ? "group" : "category"} you
            pick ({moved.join(", ")}), then {source?.name} is deleted.
          </DialogDescription>
        </DialogHeader>
        {source && (
          <div className="grid gap-3">
            <CategorySelect
              categories={categories}
              value={target}
              onChange={setTarget}
              groupsOnly={source.is_group}
              exclude={[source.id]}
            />
            <SavingsWarning from={source} to={into} categories={categories} />
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button onClick={merge} disabled={!target || busy}>
            {busy ? "Merging…" : into ? `Merge into ${into.name}` : "Merge"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function DeleteCategoryDialog({
  target,
  categories,
  onClose,
  onDone,
}: {
  target: Category | null
  categories: Category[]
  onClose: () => void
  onDone: () => void
}) {
  const usage = useCategoryUsage(target, categories)
  const [moveTo, setMoveTo] = useState<string | null>(null)
  const [entriesTo, setEntriesTo] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const { mutate } = useSWRConfig()
  const close = () => {
    setMoveTo(null)
    setEntriesTo(null)
    onClose()
  }
  const dest = categories.find((c) => c.id === moveTo)
  const isGroup = !!target?.is_group

  async function remove() {
    if (!target) {
      return
    }
    setBusy(true)
    try {
      if (isGroup) {
        await deleteGroup(target.id, { categoriesTo: moveTo, entriesTo })
      } else {
        await deleteCategory(target.id, moveTo)
      }
      toast.success(`Deleted ${target.name}.`)
      mutate("entry_counts")
      onDone()
      close()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && close()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete {target?.name}?</DialogTitle>
          <DialogDescription>
            Nothing is lost: choose where what&apos;s in it goes.
          </DialogDescription>
        </DialogHeader>
        {target && (
          <div className="grid gap-4 text-sm">
            <div className="grid gap-1.5">
              <span className="font-medium">
                {isGroup
                  ? `Its ${plural(usage.members, "category")} and ${plural(usage.transactions, "transaction")} placed on it go to`
                  : `Its ${plural(usage.transactions, "transaction")} go to`}
              </span>
              <CategorySelect
                categories={categories}
                value={moveTo}
                onChange={setMoveTo}
                groupsOnly={isGroup}
                exclude={[target.id]}
                noneLabel={isGroup ? "Needs sorting (no group)" : "No category (Needs sorting)"}
              />
              {usage.rules + usage.mappings === 0 ? (
                <p className="text-muted-foreground text-xs">
                  It has no merchant rules or bank-type mappings.
                </p>
              ) : moveTo ? (
                <p className="text-muted-foreground text-xs">
                  Its {plural(usage.rules, "merchant rule")} and{" "}
                  {plural(usage.mappings, "bank-type mapping")} move to {dest?.name} too,
                  so future imports land there.
                </p>
              ) : (
                <p className="text-xs">
                  Its {plural(usage.rules, "merchant rule")} and{" "}
                  {plural(usage.mappings, "bank-type mapping")} are removed, so future
                  imports of those merchants and bank types land in{" "}
                  <span className="font-medium">Needs sorting</span>.
                </p>
              )}
              <SavingsWarning from={target} to={dest} categories={categories} />
            </div>
            {isGroup && usage.entries > 0 && (
              <div className="grid gap-1.5">
                <span className="font-medium">
                  Its {budgetRowsLabel(usage)} go to
                </span>
                <CategorySelect
                  categories={categories}
                  value={entriesTo}
                  onChange={setEntriesTo}
                  groupsOnly
                  exclude={[target.id]}
                  noneLabel="No group"
                />
              </div>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={remove} disabled={busy}>
            {busy ? "Deleting…" : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
