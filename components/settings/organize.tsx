"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { ChevronRight, Pencil, Plus, Tag, Tags, Trash2 } from "lucide-react"
import { toast } from "sonner"

import type { Category, Label, Transaction, TypeCategory } from "@/lib/types"
import { formatNOK } from "@/lib/format"
import { cn } from "@/lib/utils"
import {
  buildTypeMap,
  effectiveCategoryId,
  effectiveDate,
  groupByMerchant,
  isInternalTx,
  type MerchantGroup,
} from "@/lib/spending"
import {
  useTransactions,
  useCategories,
  useLabels,
  useTxRules,
  useTypeCategories,
  useEntries,
} from "@/lib/data/use-budget"
import {
  categorizeBySource,
  setTransactionsLabel,
} from "@/lib/data/transactions"
import { createCategory } from "@/lib/data/categories"
import { setCategoryGroup } from "@/lib/data/groups"
import {
  createLabel,
  deleteLabel,
  renameLabel,
  setLabelCategory,
} from "@/lib/data/labels"
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
import { LabelCombobox } from "@/components/spending/label-combobox"
import { TypeMapper } from "@/components/spending/type-mapper"

const NONE = "__none__"

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split("-")
  return `${d}.${m}.${y.slice(2)}`
}

export function Organize() {
  const { transactions, mutate: mutateTx } = useTransactions()
  const { categories, mutate: mutateCats } = useCategories()
  const { labels, mutate: mutateLabels } = useLabels()
  const { typeCategories, mutate: mutateTypeCats } = useTypeCategories()
  const { mutate: mutateRules } = useTxRules()
  const { entries: bills } = useEntries("bill")
  const { entries: incomes } = useEntries("income")
  const typeMap = useMemo(() => buildTypeMap(typeCategories), [typeCategories])

  const refresh = () => {
    mutateTx()
    mutateCats()
    mutateLabels()
    mutateTypeCats()
    mutateRules()
  }

  // Groups are the categories a Bills/Income entry uses (existing convention).
  const groups = useMemo(() => {
    const used = new Set<string>()
    for (const e of [...bills, ...incomes]) if (e.category_id) used.add(e.category_id)
    return categories
      .filter((c) => used.has(c.id))
      .sort((a, b) => a.sort_order - b.sort_order)
  }, [categories, bills, incomes])

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Organize</h2>
        <p className="text-muted-foreground text-sm">
          Build your groups &amp; categories on the left; categorise every
          merchant in bulk on the right. One category decision covers all of a
          merchant&apos;s past and future charges.
        </p>
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <StructurePanel
          categories={categories}
          groups={groups}
          labels={labels}
          transactions={transactions}
          typeMap={typeMap}
          onChanged={refresh}
        />
        <TriagePanel
          transactions={transactions}
          categories={categories}
          labels={labels}
          typeCategories={typeCategories}
          typeMap={typeMap}
          onChanged={refresh}
        />
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------- Structure */

function StructurePanel({
  categories,
  groups,
  labels,
  transactions,
  typeMap,
  onChanged,
}: {
  categories: Category[]
  groups: Category[]
  labels: Label[]
  transactions: Transaction[]
  typeMap: ReturnType<typeof buildTypeMap>
  onChanged: () => void
}) {
  const router = useRouter()
  const [newCat, setNewCat] = useState("")
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [editName, setEditName] = useState("")

  const groupIds = useMemo(() => new Set(groups.map((g) => g.id)), [groups])
  const labelsByCat = useMemo(() => {
    const m = new Map<string, Label[]>()
    for (const l of labels) {
      const k = l.category_id ?? NONE
      const arr = m.get(k) ?? []
      arr.push(l)
      m.set(k, arr)
    }
    return m
  }, [labels])

  const spentByCat = useMemo(() => {
    const m = new Map<string, number>()
    for (const t of transactions) {
      if (isInternalTx(t) || Number(t.amount) >= 0) continue
      const ec = effectiveCategoryId(t, typeMap)
      if (!ec) continue
      m.set(ec, (m.get(ec) ?? 0) - Number(t.amount))
    }
    return m
  }, [transactions, typeMap])

  const viewCategory = (id: string) =>
    router.push(`/spending?tab=transactions&period=all&cat=${id}`)
  const viewLabel = (id: string) =>
    router.push(`/spending?tab=transactions&period=all&label=${id}`)

  async function addCategory() {
    const name = newCat.trim()
    if (!name) return
    setAdding(true)
    try {
      await createCategory(name)
      setNewCat("")
      onChanged()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not add category.")
    } finally {
      setAdding(false)
    }
  }

  async function act(fn: () => Promise<unknown>, err: string) {
    try {
      await fn()
      onChanged()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : err)
    }
  }

  const nonGroupCats = categories
    .filter((c) => !groupIds.has(c.id))
    .sort((a, b) => a.name.localeCompare(b.name))
  const unassignedLabels = labelsByCat.get(NONE) ?? []

  const labelRow = (l: Label) => (
    <div key={l.id} className="flex items-center gap-1.5 py-0.5 pl-6 text-xs">
      <Tag className="text-muted-foreground size-3 shrink-0" />
      {editing === l.id ? (
        <Input
          autoFocus
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && editName.trim()) {
              act(() => renameLabel(l.id, editName.trim()), "Could not rename.")
              setEditing(null)
            } else if (e.key === "Escape") setEditing(null)
          }}
          onBlur={() => setEditing(null)}
          className="h-6 w-40 text-xs"
        />
      ) : (
        <button
          type="button"
          onClick={() => viewLabel(l.id)}
          className="hover:text-foreground hover:underline"
        >
          {l.name}
        </button>
      )}
      <button
        type="button"
        aria-label="Rename label"
        onClick={() => {
          setEditing(l.id)
          setEditName(l.name)
        }}
        className="text-muted-foreground hover:text-foreground ml-auto"
      >
        <Pencil className="size-3" />
      </button>
      <button
        type="button"
        aria-label="Delete label"
        onClick={() => act(() => deleteLabel(l.id), "Could not delete.")}
        className="text-muted-foreground hover:text-destructive"
      >
        <Trash2 className="size-3" />
      </button>
    </div>
  )

  return (
    <Card className="h-fit">
      <CardHeader>
        <CardTitle className="text-base">Structure</CardTitle>
        <CardDescription>Groups → categories → labels.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {/* Group tree */}
        <div className="flex flex-col gap-3">
          {groups.length === 0 && (
            <p className="text-muted-foreground text-sm">
              No groups yet — a category becomes a group when a Bills or Income
              entry uses it.
            </p>
          )}
          {groups.map((g) => {
            const members = categories
              .filter((c) => c.group_id === g.id)
              .sort((a, b) => a.name.localeCompare(b.name))
            return (
              <div key={g.id} className="rounded-md border p-2.5">
                <div className="text-sm font-semibold">{g.name}</div>
                {members.length === 0 ? (
                  <p className="text-muted-foreground mt-1 text-xs">
                    No categories assigned.
                  </p>
                ) : (
                  <div className="mt-1.5 flex flex-col gap-1.5">
                    {members.map((c) => (
                      <div key={c.id} className="flex flex-col">
                        <div className="flex items-center justify-between gap-2">
                          <button
                            type="button"
                            onClick={() => viewCategory(c.id)}
                            className="hover:text-primary text-sm hover:underline"
                          >
                            {c.name}
                          </button>
                          <span className="text-muted-foreground text-xs tabular-nums">
                            {formatNOK(spentByCat.get(c.id) ?? 0)}
                          </span>
                        </div>
                        {(labelsByCat.get(c.id) ?? [])
                          .sort((a, b) => a.name.localeCompare(b.name))
                          .map(labelRow)}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Unassigned categories */}
        <div className="flex flex-col gap-2">
          <div className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            Categories
          </div>
          <div className="flex gap-2">
            <Input
              value={newCat}
              onChange={(e) => setNewCat(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addCategory()}
              placeholder="New category, e.g. Games"
              className="h-8 text-sm"
            />
            <Button size="sm" onClick={addCategory} disabled={adding || !newCat.trim()}>
              <Plus className="size-4" />
            </Button>
          </div>
          <div className="flex flex-col divide-y">
            {nonGroupCats.map((c) => (
              <div key={c.id} className="flex flex-col py-1.5">
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => viewCategory(c.id)}
                    className="hover:text-primary truncate text-sm hover:underline"
                  >
                    {c.name}
                  </button>
                  <Select
                    value={c.group_id ?? NONE}
                    onValueChange={(v) =>
                      act(
                        () => setCategoryGroup(c.id, v === NONE ? null : v),
                        "Could not assign group.",
                      )
                    }
                  >
                    <SelectTrigger className="h-7 w-[150px] text-xs">
                      <SelectValue placeholder="No group" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>No group</SelectItem>
                      {groups.map((g) => (
                        <SelectItem key={g.id} value={g.id}>
                          {g.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {(labelsByCat.get(c.id) ?? [])
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map(labelRow)}
              </div>
            ))}
          </div>
        </div>

        {/* Labels without a home category */}
        {unassignedLabels.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <div className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              Labels needing a home category
            </div>
            {unassignedLabels
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((l) => (
                <div key={l.id} className="flex items-center gap-2 text-xs">
                  <Tag className="text-muted-foreground size-3" />
                  <span className="truncate">{l.name}</span>
                  <Select
                    onValueChange={(v) =>
                      act(() => setLabelCategory(l.id, v), "Could not set home.")
                    }
                  >
                    <SelectTrigger className="ml-auto h-7 w-[150px] text-xs">
                      <SelectValue placeholder="Set home…" />
                    </SelectTrigger>
                    <SelectContent>
                      {categories
                        .slice()
                        .sort((a, b) => a.name.localeCompare(b.name))
                        .map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/* ------------------------------------------------------------------- Triage */

function TriagePanel({
  transactions,
  categories,
  labels,
  typeCategories,
  typeMap,
  onChanged,
}: {
  transactions: Transaction[]
  categories: Category[]
  labels: Label[]
  typeCategories: TypeCategory[]
  typeMap: ReturnType<typeof buildTypeMap>
  onChanged: () => void
}) {
  const [search, setSearch] = useState("")
  const [onlyUncat, setOnlyUncat] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [mapperOpen, setMapperOpen] = useState(false)

  const spending = useMemo(
    () => transactions.filter((t) => !isInternalTx(t)),
    [transactions],
  )
  const merchants = useMemo(() => groupByMerchant(spending), [spending])

  // A merchant's category: the single resolved category shared by its rows, or
  // null when none/mixed.
  const merchantCat = (g: MerchantGroup): string | null => {
    const cats = new Set(
      g.txns.map((t) => effectiveCategoryId(t, typeMap)).filter(Boolean) as string[],
    )
    return cats.size === 1 ? [...cats][0] : null
  }
  const catName = (id: string | null) =>
    categories.find((c) => c.id === id)?.name ?? null

  const covered = spending.filter((t) => effectiveCategoryId(t, typeMap)).length
  const pct = spending.length ? Math.round((covered / spending.length) * 100) : 100

  const q = search.trim().toLowerCase()
  const shown = merchants.filter((g) => {
    if (q && !g.name.toLowerCase().includes(q)) return false
    if (onlyUncat && merchantCat(g)) return false
    return true
  })

  async function assignMerchant(g: MerchantGroup, value: string) {
    const catId = value === NONE ? null : value
    try {
      const n = await categorizeBySource(g.sample, catId)
      onChanged()
      toast.success(
        catId
          ? `${catName(catId)} → ${n} transaction(s), now and on future imports.`
          : `Cleared category on ${n} transaction(s).`,
      )
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not categorise.")
    }
  }

  return (
    <Card>
      <CardHeader className="gap-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base">Merchants</CardTitle>
            <CardDescription>
              {covered.toLocaleString("nb-NO")} /{" "}
              {spending.length.toLocaleString("nb-NO")} categorised ({pct}%)
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => setMapperOpen(true)}>
            <Tags className="size-4" />
            Bank types
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search merchant…"
            className="h-8 sm:max-w-xs"
          />
          <label className="text-muted-foreground flex cursor-pointer items-center gap-1.5 text-sm">
            <input
              type="checkbox"
              checked={onlyUncat}
              onChange={(e) => setOnlyUncat(e.target.checked)}
            />
            Needs a category only
          </label>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col">
        {shown.length === 0 ? (
          <p className="text-muted-foreground py-8 text-center text-sm">
            {onlyUncat
              ? "Everything's categorised 🎉"
              : "No merchants match that search."}
          </p>
        ) : (
          <div className="flex flex-col divide-y">
            {shown.map((g) => {
              const cat = merchantCat(g)
              const mixed =
                !cat &&
                new Set(
                  g.txns
                    .map((t) => effectiveCategoryId(t, typeMap))
                    .filter(Boolean),
                ).size > 1
              const isOpen = expanded === g.key
              return (
                <div key={g.key} className="py-1.5">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setExpanded(isOpen ? null : g.key)}
                      className="hover:text-foreground flex min-w-0 flex-1 items-center gap-1.5 text-left"
                    >
                      <ChevronRight
                        className={cn(
                          "size-3.5 shrink-0 transition-transform",
                          isOpen && "rotate-90",
                        )}
                      />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">
                          {g.name}
                        </span>
                        <span className="text-muted-foreground text-xs">
                          {g.count} tx · {formatNOK(g.spent)}
                          {mixed && " · mixed categories"}
                        </span>
                      </span>
                    </button>
                    <Select
                      value={cat ?? NONE}
                      onValueChange={(v) => assignMerchant(g, v)}
                    >
                      <SelectTrigger className="h-8 w-[150px] shrink-0 text-xs">
                        <SelectValue placeholder="Uncategorised">
                          {cat ? (
                            catName(cat)
                          ) : (
                            <span className="text-muted-foreground">
                              {mixed ? "Mixed" : "Set category"}
                            </span>
                          )}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>Uncategorised</SelectItem>
                        {categories
                          .slice()
                          .sort((a, b) => a.name.localeCompare(b.name))
                          .map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {isOpen && (
                    <ExpandedMerchant
                      group={g}
                      labels={labels}
                      homeCategory={cat}
                      onChanged={onChanged}
                    />
                  )}
                </div>
              )
            })}
          </div>
        )}
      </CardContent>

      <TypeMapper
        open={mapperOpen}
        onOpenChange={setMapperOpen}
        transactions={transactions}
        categories={categories}
        typeCategories={typeCategories}
        onChanged={onChanged}
      />
    </Card>
  )
}

/* --------------------------------------------- Expanded merchant: labelling */

function ExpandedMerchant({
  group,
  labels,
  homeCategory,
  onChanged,
}: {
  group: MerchantGroup
  labels: Label[]
  homeCategory: string | null
  onChanged: () => void
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const labelName = (id: string | null) =>
    labels.find((l) => l.id === id)?.name ?? null

  // New labels inherit this merchant's category as their home, so a "Path of
  // Exile 2" created on a Games charge totals under Games across all channels.
  async function createAndGetId(name: string): Promise<string> {
    const l = await createLabel(name, homeCategory)
    onChanged()
    return l.id
  }
  async function applyLabel(ids: string[], labelId: string | null) {
    try {
      await setTransactionsLabel(ids, labelId)
      onChanged()
      setSelected(new Set())
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not label.")
    }
  }

  const rows = group.txns
    .slice()
    .sort((a, b) => effectiveDate(b).localeCompare(effectiveDate(a)))

  return (
    <div className="mt-1.5 ml-5 flex flex-col gap-1 border-l pl-3">
      {selected.size > 0 && (
        <div className="flex items-center gap-2 py-1 text-xs">
          <span className="font-medium">{selected.size} selected</span>
          <LabelCombobox
            labels={labels}
            onPick={(id) => applyLabel([...selected], id)}
            onCreate={createAndGetId}
            trigger={
              <span className="border-input hover:bg-accent inline-flex h-7 items-center gap-1 rounded-md border px-2">
                <Tag className="size-3" /> Apply label
              </span>
            }
          />
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="text-muted-foreground hover:text-foreground"
          >
            Deselect
          </button>
        </div>
      )}
      {rows.map((t) => (
        <div key={t.id} className="flex items-center gap-2 py-0.5 text-xs">
          <input
            type="checkbox"
            checked={selected.has(t.id)}
            onChange={() =>
              setSelected((s) => {
                const n = new Set(s)
                if (n.has(t.id)) n.delete(t.id)
                else n.add(t.id)
                return n
              })
            }
          />
          <span className="text-muted-foreground w-14 shrink-0 tabular-nums">
            {fmtDate(effectiveDate(t))}
          </span>
          <span className="min-w-0 flex-1 truncate">{t.description || t.type}</span>
          <span className="tabular-nums">{formatNOK(Number(t.amount))}</span>
          <LabelCombobox
            labels={labels}
            value={t.label_id}
            onPick={(id) => applyLabel([t.id], id)}
            onCreate={createAndGetId}
            align="end"
            trigger={
              t.label_id ? (
                <Badge variant="secondary" className="gap-1 font-normal">
                  <Tag className="size-3" />
                  {labelName(t.label_id) ?? "Label"}
                </Badge>
              ) : (
                <span className="text-muted-foreground hover:text-foreground inline-flex items-center gap-0.5">
                  <Plus className="size-3" />
                </span>
              )
            }
          />
        </div>
      ))}
    </div>
  )
}
