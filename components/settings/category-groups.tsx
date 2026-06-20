"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Plus } from "lucide-react"
import { toast } from "sonner"

import type { Category, Entry, Transaction } from "@/lib/types"
import { annualTotal, type BudgetContext } from "@/lib/budget"
import { formatNOK } from "@/lib/format"
import { effectiveCategoryId, type TypeMap } from "@/lib/spending"
import { createCategory } from "@/lib/data/categories"
import { setCategoryGroup } from "@/lib/data/groups"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const NONE = "__none__"

export function CategoryGroups({
  categories,
  groups,
  transactions,
  typeMap,
  billEntries,
  incomeEntries,
  ctx,
  onChanged,
}: {
  categories: Category[]
  groups: Category[]
  transactions: Transaction[]
  typeMap: TypeMap
  billEntries: Entry[]
  incomeEntries: Entry[]
  ctx: BudgetContext
  onChanged: () => void
}) {
  const router = useRouter()
  const [newName, setNewName] = useState("")
  const [adding, setAdding] = useState(false)
  const [savingId, setSavingId] = useState<string | null>(null)

  // See what's actually in a category: open the Spending list filtered to it.
  const viewCategory = (categoryId: string) =>
    router.push(`/spending?tab=transactions&period=all&cat=${categoryId}`)

  const groupIds = useMemo(() => new Set(groups.map((g) => g.id)), [groups])

  // Transaction usage per resolved category.
  const usage = useMemo(() => {
    const m = new Map<string, { count: number; spent: number }>()
    for (const t of transactions) {
      const ec = effectiveCategoryId(t, typeMap)
      if (!ec) continue
      const u = m.get(ec) ?? { count: 0, spent: 0 }
      u.count++
      if (Number(t.amount) < 0) u.spent += -Number(t.amount)
      m.set(ec, u)
    }
    return m
  }, [transactions, typeMap])

  const budgetOf = (catId: string) =>
    annualTotal(
      [...billEntries, ...incomeEntries].filter((e) => e.category_id === catId),
      ctx,
    )

  const nonGroupCats = useMemo(
    () =>
      categories
        .filter((c) => !groupIds.has(c.id))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [categories, groupIds],
  )

  async function addCategory() {
    const name = newName.trim()
    if (!name) return
    setAdding(true)
    try {
      await createCategory(name)
      setNewName("")
      onChanged()
      toast.success(`Added category “${name}”.`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not add category.")
    } finally {
      setAdding(false)
    }
  }

  async function assign(catId: string, value: string) {
    setSavingId(catId)
    try {
      await setCategoryGroup(catId, value === NONE ? null : value)
      onChanged()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save.")
    } finally {
      setSavingId(null)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Groups overview ----------------------------------------------------- */}
      <Card>
        <CardHeader>
          <CardTitle>Groups</CardTitle>
          <CardDescription>
            Groups are created automatically from the categories your Bills &amp;
            Income use. Add a budget entry under a category to make it a group.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {groups.length === 0 ? (
            <p className="text-muted-foreground text-sm">No groups yet.</p>
          ) : (
            <div className="flex flex-col divide-y">
              {groups.map((g) => {
                const members = categories.filter((c) => c.group_id === g.id)
                return (
                  <div key={g.id} className="flex flex-col gap-1.5 py-3">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="font-medium">{g.name}</span>
                      <span className="text-muted-foreground text-sm tabular-nums">
                        {formatNOK(budgetOf(g.id))}/yr budget
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {members.length === 0 ? (
                        <span className="text-muted-foreground text-xs">
                          No categories assigned yet
                        </span>
                      ) : (
                        members.map((c) => (
                          <button key={c.id} type="button" onClick={() => viewCategory(c.id)}>
                            <Badge
                              variant="secondary"
                              className="hover:bg-muted cursor-pointer font-normal"
                            >
                              {c.name}
                            </Badge>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Categories ---------------------------------------------------------- */}
      <Card>
        <CardHeader>
          <CardTitle>Categories</CardTitle>
          <CardDescription>
            Every category (the bank&apos;s own plus any you create). Assign each
            to a group; a payment&apos;s category — changed on the Spending page —
            decides which group it counts toward.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex gap-2">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="New category, e.g. Charging"
              onKeyDown={(e) => {
                if (e.key === "Enter") addCategory()
              }}
              className="sm:max-w-xs"
            />
            <Button onClick={addCategory} disabled={adding || !newName.trim()}>
              <Plus className="size-4" />
              Add
            </Button>
          </div>

          <div className="flex flex-col divide-y">
            {nonGroupCats.map((c) => {
              const u = usage.get(c.id)
              return (
                <div
                  key={c.id}
                  className="flex items-center justify-between gap-3 py-2"
                >
                  <div className="min-w-0">
                    <button
                      type="button"
                      onClick={() => viewCategory(c.id)}
                      className="hover:text-primary truncate text-left text-sm font-medium hover:underline"
                      title="View matching transactions"
                    >
                      {c.name}
                    </button>
                    <div className="text-muted-foreground text-xs">
                      {u ? `${u.count} tx · ${formatNOK(u.spent)}` : "no activity"}
                    </div>
                  </div>
                  <Select
                    value={c.group_id ?? NONE}
                    onValueChange={(v) => assign(c.id, v)}
                    disabled={savingId === c.id}
                  >
                    <SelectTrigger className="h-8 w-[180px] text-xs">
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
              )
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
