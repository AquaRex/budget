"use client"

import { useMemo, useState } from "react"
import { toast } from "sonner"

import type { Category, Transaction, TypeGroup } from "@/lib/types"
import { formatNOK } from "@/lib/format"
import { isInternalTx, buildGroupMap } from "@/lib/spending"
import { setTypeGroup, setCategoryIsGroup } from "@/lib/data/groups"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const NONE = "__none__"

type TypeStat = { type: string; count: number; spent: number }

export function GroupMapper({
  open,
  onOpenChange,
  transactions,
  categories,
  typeGroups,
  onChanged,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  transactions: Transaction[]
  categories: Category[]
  typeGroups: TypeGroup[]
  onChanged: () => void
}) {
  const [savingType, setSavingType] = useState<string | null>(null)
  const [savingCat, setSavingCat] = useState<string | null>(null)
  const groupMap = useMemo(() => buildGroupMap(typeGroups), [typeGroups])
  const groups = useMemo(
    () => categories.filter((c) => c.is_group),
    [categories],
  )

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

  async function toggleGroup(cat: Category, value: boolean) {
    setSavingCat(cat.id)
    try {
      await setCategoryIsGroup(cat.id, value)
      onChanged()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save.")
    } finally {
      setSavingCat(null)
    }
  }

  async function assign(type: string, value: string) {
    const id = value === NONE ? null : value
    setSavingType(type)
    try {
      await setTypeGroup(type, id)
      onChanged()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save.")
    } finally {
      setSavingType(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Configure groups</DialogTitle>
          <DialogDescription>
            Pick which categories act as high-level groups, then roll each bank
            transaction type up into one. This only affects the Groups page — the
            Spending page keeps its detailed view.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div>
            <h3 className="mb-1 text-sm font-semibold">Groups</h3>
            <p className="text-muted-foreground mb-2 text-xs">
              These become the bands on the Groups page. Budgeted amounts come
              from the Bills/Income entries in each.
            </p>
            <div className="flex flex-col divide-y">
              {categories.length === 0 ? (
                <p className="text-muted-foreground py-4 text-center text-sm">
                  No categories yet.
                </p>
              ) : (
                categories.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between gap-3 py-2"
                  >
                    <span className="truncate text-sm">{c.name}</span>
                    <Switch
                      checked={c.is_group}
                      disabled={savingCat === c.id}
                      onCheckedChange={(v) => toggleGroup(c, v)}
                      aria-label={`Use ${c.name} as a group`}
                    />
                  </div>
                ))
              )}
            </div>
          </div>

          <Separator />

          <div>
            <h3 className="mb-1 text-sm font-semibold">Assign bank types</h3>
            <p className="text-muted-foreground mb-2 text-xs">
              Put each of the bank&apos;s transaction types into one of your
              groups. Anything left unassigned shows under “Unassigned”.
            </p>
            <div className="flex flex-col divide-y">
              {groups.length === 0 ? (
                <p className="text-muted-foreground py-4 text-center text-sm">
                  Turn on at least one group above first.
                </p>
              ) : stats.length === 0 ? (
                <p className="text-muted-foreground py-4 text-center text-sm">
                  No transactions yet.
                </p>
              ) : (
                stats.map((s) => (
                  <div
                    key={s.type}
                    className="flex items-center justify-between gap-3 py-2"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">
                        {s.type}
                      </div>
                      <div className="text-muted-foreground text-xs">
                        {s.count} tx · {formatNOK(s.spent)}
                      </div>
                    </div>
                    <Select
                      value={groupMap.get(s.type) ?? NONE}
                      onValueChange={(v) => assign(s.type, v)}
                      disabled={savingType === s.type}
                    >
                      <SelectTrigger className="h-8 w-[170px] text-xs">
                        <SelectValue placeholder="Unassigned" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>Unassigned</SelectItem>
                        {groups.map((g) => (
                          <SelectItem key={g.id} value={g.id}>
                            {g.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
