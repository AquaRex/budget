"use client"

import { useMemo, useState } from "react"
import { toast } from "sonner"

import type { Category, Transaction, TypeCategory } from "@/lib/types"
import { formatNOK } from "@/lib/format"
import { isInternalTx, buildTypeMap } from "@/lib/spending"
import { setTypeCategory } from "@/lib/data/type-categories"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const NONE = "__none__"

type TypeStat = { type: string; count: number; spent: number }

export function TypeMapper({
  open,
  onOpenChange,
  transactions,
  categories,
  typeCategories,
  onChanged,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  transactions: Transaction[]
  categories: Category[]
  typeCategories: TypeCategory[]
  onChanged: () => void
}) {
  const [saving, setSaving] = useState<string | null>(null)
  const typeMap = useMemo(() => buildTypeMap(typeCategories), [typeCategories])

  const stats = useMemo<TypeStat[]>(() => {
    const m = new Map<string, TypeStat>()
    for (const t of transactions) {
      if (isInternalTx(t) || !t.type) continue
      const s = m.get(t.type) ?? { type: t.type, count: 0, spent: 0 }
      s.count++
      if (Number(t.amount) < 0) s.spent += -Number(t.amount)
      m.set(t.type, s)
    }
    return Array.from(m.values()).sort((a, b) => b.spent - a.spent)
  }, [transactions])

  async function assign(type: string, value: string) {
    const id = value === NONE ? null : value
    setSaving(type)
    try {
      await setTypeCategory(type, id)
      onChanged()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save.")
    } finally {
      setSaving(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Bank categories</DialogTitle>
          <DialogDescription>
            Group the bank&apos;s transaction types into your budget categories.
            Anything left ungrouped shows up under its own name (e.g. “Spill”).
            A per-transaction category always overrides these.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col divide-y">
          {stats.length === 0 ? (
            <p className="text-muted-foreground py-6 text-center text-sm">
              No transactions yet.
            </p>
          ) : (
            stats.map((s) => (
              <div
                key={s.type}
                className="flex items-center justify-between gap-3 py-2"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{s.type}</div>
                  <div className="text-muted-foreground text-xs">
                    {s.count} tx · {formatNOK(s.spent)}
                  </div>
                </div>
                <Select
                  value={typeMap.get(s.type) ?? NONE}
                  onValueChange={(v) => assign(s.type, v)}
                  disabled={saving === s.type}
                >
                  <SelectTrigger className="h-8 w-[170px] text-xs">
                    <SelectValue placeholder="Ungrouped" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Ungrouped</SelectItem>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
