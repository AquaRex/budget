"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Check, MoreHorizontal, Plus, Search, Tag, Wand2, X } from "lucide-react"
import { toast } from "sonner"

import type { Category, Label as TxLabel, Transaction } from "@/lib/types"
import { formatNOK } from "@/lib/format"
import { cn } from "@/lib/utils"
import {
  deriveStem,
  descMatches,
  hasConflict,
  isInternalTx,
  effectiveCategoryId,
  effectiveDate,
  type TypeMap,
} from "@/lib/spending"
import {
  categorizeBySource,
  setTransactionExcluded,
  setTransactionLabel,
  setTransactionsLabel,
  resolveConflict,
  saveRuleAndApply,
} from "@/lib/data/transactions"
import { createLabel } from "@/lib/data/labels"
import { LabelCombobox } from "@/components/spending/label-combobox"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

const NONE = "__none__"

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split("-")
  return `${d}.${m}.${y.slice(2)}`
}

type RuleDraft = {
  tx: Transaction
  matchType: "description" | "account"
  pattern: string
  categoryId: string
}

export function TransactionsTable({
  transactions,
  categories,
  labels,
  typeMap,
  query,
  onQueryChange,
  highlight,
  categoryFilter,
  labelFilter,
  onClearCategoryFilter,
  onClearLabelFilter,
  onChanged,
  onLabelsChanged,
}: {
  transactions: Transaction[]
  categories: Category[]
  labels: TxLabel[]
  typeMap: TypeMap
  query: string
  onQueryChange: (q: string) => void
  /** A Bills/Income drill target: highlight this merchant in this exact month. */
  highlight?: { merchant: string; period: string } | null
  /** Show only transactions whose resolved category is this one. */
  categoryFilter?: string | null
  /** Show only transactions with this label ("__none__" = unlabeled). */
  labelFilter?: string | null
  onClearCategoryFilter?: () => void
  onClearLabelFilter?: () => void
  onChanged: () => void
  onLabelsChanged: () => void
}) {
  const [showInternal, setShowInternal] = useState(false)
  const [rule, setRule] = useState<RuleDraft | null>(null)
  const [savingRule, setSavingRule] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const firstHitRef = useRef<HTMLTableRowElement | null>(null)

  const catName = (id: string | null) =>
    categories.find((c) => c.id === id)?.name ?? null
  const labelName = (id: string | null) =>
    labels.find((l) => l.id === id)?.name ?? null

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return transactions.filter((t) => {
      if (!showInternal && isInternalTx(t)) return false
      if (categoryFilter && effectiveCategoryId(t, typeMap) !== categoryFilter)
        return false
      if (labelFilter === NONE && t.label_id) return false
      if (labelFilter && labelFilter !== NONE && t.label_id !== labelFilter)
        return false
      if (!q) return true
      return (
        // descMatches is stem-aware so a drilled merchant key (e.g. "compass
        // hi") matches "COMPASS 5105 HI" with interior digits.
        descMatches(t.description, q) ||
        (t.type ?? "").toLowerCase().includes(q) ||
        (t.message ?? "").toLowerCase().includes(q)
      )
    })
  }, [transactions, query, showInternal, categoryFilter, labelFilter, typeMap])

  // A row is a drill hit when it matches the merchant AND the exact month.
  const isHit = (t: Transaction) =>
    !!highlight &&
    effectiveDate(t).slice(0, 7) === highlight.period &&
    descMatches(t.description, highlight.merchant)

  // The first matching row — used to scroll it into view.
  const firstHitId = useMemo(() => {
    if (!highlight) return null
    return rows.find(isHit)?.id ?? null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, highlight])

  useEffect(() => {
    if (!firstHitId) return
    const el = firstHitRef.current
    if (el)
      requestAnimationFrame(() =>
        el.scrollIntoView({ behavior: "smooth", block: "center" }),
      )
  }, [firstHitId])

  const conflictCount = transactions.filter(hasConflict).length

  async function assignCategory(t: Transaction, value: string) {
    const id = value === NONE ? null : value
    try {
      const n = await categorizeBySource(t, id)
      onChanged()
      if (n > 1)
        toast.success(
          `Updated ${n} transactions from this source — future imports too.`,
        )
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update category.")
    }
  }

  async function createAndGetId(name: string): Promise<string> {
    const l = await createLabel(name)
    onLabelsChanged()
    return l.id
  }

  async function assignLabel(t: Transaction, labelId: string | null) {
    try {
      await setTransactionLabel(t.id, labelId)
      onChanged()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not set label.")
    }
  }

  async function bulkAssignLabel(labelId: string | null) {
    const ids = Array.from(selected)
    try {
      await setTransactionsLabel(ids, labelId)
      setSelected(new Set())
      onChanged()
      toast.success(
        labelId
          ? `Labelled ${ids.length} transaction(s).`
          : `Cleared label on ${ids.length} transaction(s).`,
      )
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not apply label.")
    }
  }

  const toggleSelected = (id: string) =>
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  async function toggleExcluded(t: Transaction) {
    try {
      await setTransactionExcluded(t.id, !t.is_excluded)
      onChanged()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update.")
    }
  }

  async function resolve(t: Transaction, keep: "new" | "old") {
    try {
      await resolveConflict(t, keep)
      onChanged()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not resolve.")
    }
  }

  function openRule(t: Transaction) {
    setRule({
      tx: t,
      matchType: "description",
      pattern: deriveStem(t.description) || (t.description ?? ""),
      categoryId: t.category_id ?? categories[0]?.id ?? "",
    })
  }

  async function saveRule() {
    if (!rule || !rule.categoryId || !rule.pattern.trim()) return
    setSavingRule(true)
    try {
      const n = await saveRuleAndApply(
        { match_type: rule.matchType, pattern: rule.pattern.trim().toLowerCase() },
        rule.categoryId,
      )
      toast.success(`Rule saved · categorised ${n} matching transaction(s).`)
      setRule(null)
      onChanged()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save rule.")
    } finally {
      setSavingRule(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="relative w-full sm:max-w-xs">
          <Search className="text-muted-foreground absolute top-2.5 left-2.5 size-4" />
          <Input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Search merchant, type…"
            className="pl-8"
          />
        </div>
        <div className="flex items-center gap-3 text-sm">
          {categoryFilter && (
            <Badge variant="secondary" className="gap-1 font-normal">
              {catName(categoryFilter) ?? "Category"}
              {onClearCategoryFilter && (
                <button
                  type="button"
                  aria-label="Clear category filter"
                  onClick={onClearCategoryFilter}
                  className="hover:text-foreground"
                >
                  <X className="size-3" />
                </button>
              )}
            </Badge>
          )}
          {labelFilter && (
            <Badge variant="secondary" className="gap-1 font-normal">
              <Tag className="size-3" />
              {labelFilter === NONE ? "No label" : labelName(labelFilter) ?? "Label"}
              {onClearLabelFilter && (
                <button
                  type="button"
                  aria-label="Clear label filter"
                  onClick={onClearLabelFilter}
                  className="hover:text-foreground"
                >
                  <X className="size-3" />
                </button>
              )}
            </Badge>
          )}
          {conflictCount > 0 && (
            <Badge
              variant="outline"
              className="border-amber-500/40 text-amber-600 dark:text-amber-400"
            >
              {conflictCount} to review
            </Badge>
          )}
          <label className="text-muted-foreground flex cursor-pointer items-center gap-1.5">
            <input
              type="checkbox"
              checked={showInternal}
              onChange={(e) => setShowInternal(e.target.checked)}
            />
            Show transfers
          </label>
        </div>
      </div>

      {selected.size > 0 && (
        <div className="bg-muted/40 flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-sm">
          <span className="font-medium">{selected.size} selected</span>
          <LabelCombobox
            labels={labels}
            onPick={(id) => bulkAssignLabel(id)}
            onCreate={createAndGetId}
            trigger={
              <span className="border-input hover:bg-accent inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium">
                <Tag className="size-3.5" />
                Apply label
              </span>
            }
          />
          <Button variant="ghost" size="sm" onClick={() => bulkAssignLabel(null)}>
            Clear label
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelected(new Set())}
          >
            Deselect
          </Button>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-muted/50 text-muted-foreground border-b text-xs">
              <th className="w-8 px-2 py-2">
                <input
                  type="checkbox"
                  aria-label="Select all"
                  checked={rows.length > 0 && rows.every((r) => selected.has(r.id))}
                  onChange={(e) =>
                    setSelected((s) => {
                      const next = new Set(s)
                      if (e.target.checked) rows.forEach((r) => next.add(r.id))
                      else rows.forEach((r) => next.delete(r.id))
                      return next
                    })
                  }
                />
              </th>
              <th className="px-3 py-2 text-left font-medium">Date</th>
              <th className="px-2 py-2 text-left font-medium">Description</th>
              <th className="px-2 py-2 text-left font-medium">Category</th>
              <th className="px-2 py-2 text-left font-medium">Label</th>
              <th className="px-2 py-2 text-right font-medium">Amount</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="text-muted-foreground py-10 text-center"
                >
                  No transactions. Import a CSV above to get started.
                </td>
              </tr>
            ) : (
              rows.map((t) => {
                const amt = Number(t.amount)
                const internal = isInternalTx(t)
                const income = amt > 0 && !internal
                const conflict = hasConflict(t)
                const hit = isHit(t)
                return (
                  <tr
                    key={t.id}
                    ref={t.id === firstHitId ? firstHitRef : undefined}
                    className={cn(
                      "border-b last:border-0 align-top",
                      t.is_excluded && "opacity-50",
                      conflict && "bg-amber-500/5",
                      hit && "bg-primary/10",
                      selected.has(t.id) && "bg-primary/5",
                    )}
                  >
                    <td className="px-2 py-2">
                      <input
                        type="checkbox"
                        aria-label="Select transaction"
                        checked={selected.has(t.id)}
                        onChange={() => toggleSelected(t.id)}
                      />
                    </td>
                    <td className="text-muted-foreground px-3 py-2 whitespace-nowrap">
                      {fmtDate(effectiveDate(t))}
                    </td>
                    <td className="px-2 py-2">
                      <div className="font-medium">{t.description || t.type}</div>
                      <div className="text-muted-foreground text-xs">
                        {t.type}
                        {internal && (
                          <Badge
                            variant="outline"
                            className="ml-1.5 text-[10px]"
                          >
                            transfer
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-2 py-2">
                      <Select
                        value={effectiveCategoryId(t, typeMap) ?? NONE}
                        onValueChange={(v) => assignCategory(t, v)}
                      >
                        <SelectTrigger className="h-8 w-[150px] text-xs">
                          <SelectValue placeholder="Uncategorised">
                            {(() => {
                              const ec = effectiveCategoryId(t, typeMap)
                              if (ec) return catName(ec)
                              return (
                                <span className="text-muted-foreground">
                                  {t.type || "Uncategorised"}
                                </span>
                              )
                            })()}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE}>Uncategorised</SelectItem>
                          {categories.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-2 py-2">
                      <LabelCombobox
                        labels={labels}
                        value={t.label_id}
                        onPick={(id) => assignLabel(t, id)}
                        onCreate={createAndGetId}
                        trigger={
                          t.label_id ? (
                            <Badge
                              variant="secondary"
                              className="gap-1 font-normal"
                            >
                              <Tag className="size-3" />
                              {labelName(t.label_id) ?? "Label"}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs">
                              <Plus className="size-3" />
                              Label
                            </span>
                          )
                        }
                      />
                    </td>
                    <td className="px-2 py-2 text-right whitespace-nowrap">
                      {conflict ? (
                        <div className="flex flex-col items-end gap-1">
                          <button
                            onClick={() => resolve(t, "old")}
                            className="flex items-center gap-1 text-rose-600 line-through dark:text-rose-400"
                            title="Keep the old value"
                          >
                            <Check className="size-3" />
                            {formatNOK(amt)}
                          </button>
                          <button
                            onClick={() => resolve(t, "new")}
                            className="flex items-center gap-1 font-semibold text-emerald-600 dark:text-emerald-400"
                            title="Keep the new value"
                          >
                            <Check className="size-3" />
                            {formatNOK(Number(t.pending_amount))}
                          </button>
                        </div>
                      ) : (
                        <span
                          className={cn(
                            "font-medium tabular-nums",
                            income
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-foreground",
                          )}
                        >
                          {formatNOK(amt)}
                        </span>
                      )}
                    </td>
                    <td className="px-1 py-2">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" aria-label="Actions">
                            <MoreHorizontal className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openRule(t)}>
                            <Wand2 className="size-4" />
                            Make a rule…
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => toggleExcluded(t)}>
                            {t.is_excluded ? "Include in spending" : "Exclude from spending"}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={!!rule} onOpenChange={(o) => !o && setRule(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Always categorise this</DialogTitle>
            <DialogDescription>
              Future imports matching this pattern get the chosen category
              automatically.
            </DialogDescription>
          </DialogHeader>
          {rule && (
            <div className="grid gap-4 py-2">
              <div className="grid gap-2">
                <Label>Match by</Label>
                <Select
                  value={rule.matchType}
                  onValueChange={(v) =>
                    setRule({
                      ...rule,
                      matchType: v as "description" | "account",
                      pattern:
                        v === "account"
                          ? rule.tx.to_account ?? rule.tx.from_account ?? ""
                          : deriveStem(rule.tx.description) ||
                            (rule.tx.description ?? ""),
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="description">
                      Merchant / description
                    </SelectItem>
                    <SelectItem value="account">Account number</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="rule-pattern">
                  {rule.matchType === "description"
                    ? "Text to match (contains)"
                    : "Account number"}
                </Label>
                <Input
                  id="rule-pattern"
                  value={rule.pattern}
                  onChange={(e) => setRule({ ...rule, pattern: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label>Category</Label>
                <Select
                  value={rule.categoryId}
                  onValueChange={(v) => setRule({ ...rule, categoryId: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRule(null)}>
              Cancel
            </Button>
            <Button
              onClick={saveRule}
              disabled={savingRule || !rule?.categoryId || !rule?.pattern.trim()}
            >
              {savingRule ? "Saving…" : "Save rule"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
