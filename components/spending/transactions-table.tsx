"use client"

import { useMemo, useState } from "react"
import { Check, MoreHorizontal, Search, Wand2 } from "lucide-react"
import { toast } from "sonner"

import type { Category, Transaction } from "@/lib/types"
import { formatNOK } from "@/lib/format"
import { cn } from "@/lib/utils"
import { deriveStem, hasConflict, isInternalTx } from "@/lib/spending"
import {
  setTransactionCategory,
  setTransactionExcluded,
  resolveConflict,
  saveRuleAndApply,
} from "@/lib/data/transactions"
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
  onChanged,
}: {
  transactions: Transaction[]
  categories: Category[]
  onChanged: () => void
}) {
  const [query, setQuery] = useState("")
  const [showInternal, setShowInternal] = useState(false)
  const [rule, setRule] = useState<RuleDraft | null>(null)
  const [savingRule, setSavingRule] = useState(false)

  const catName = (id: string | null) =>
    categories.find((c) => c.id === id)?.name ?? null

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return transactions.filter((t) => {
      if (!showInternal && isInternalTx(t)) return false
      if (!q) return true
      return (
        (t.description ?? "").toLowerCase().includes(q) ||
        (t.type ?? "").toLowerCase().includes(q) ||
        (t.message ?? "").toLowerCase().includes(q)
      )
    })
  }, [transactions, query, showInternal])

  const conflictCount = transactions.filter(hasConflict).length

  async function assignCategory(t: Transaction, value: string) {
    const id = value === NONE ? null : value
    try {
      await setTransactionCategory(t.id, id)
      onChanged()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update category.")
    }
  }

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
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search merchant, type…"
            className="pl-8"
          />
        </div>
        <div className="flex items-center gap-3 text-sm">
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

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-muted/50 text-muted-foreground border-b text-xs">
              <th className="px-3 py-2 text-left font-medium">Date</th>
              <th className="px-2 py-2 text-left font-medium">Description</th>
              <th className="px-2 py-2 text-left font-medium">Category</th>
              <th className="px-2 py-2 text-right font-medium">Amount</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
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
                return (
                  <tr
                    key={t.id}
                    className={cn(
                      "border-b last:border-0 align-top",
                      t.is_excluded && "opacity-50",
                      conflict && "bg-amber-500/5",
                    )}
                  >
                    <td className="text-muted-foreground px-3 py-2 whitespace-nowrap">
                      {fmtDate(t.booked_date)}
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
                        value={t.category_id ?? NONE}
                        onValueChange={(v) => assignCategory(t, v)}
                      >
                        <SelectTrigger className="h-8 w-[150px] text-xs">
                          <SelectValue placeholder="Uncategorised">
                            {catName(t.category_id) ?? "Uncategorised"}
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
