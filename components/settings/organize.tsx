"use client"

import { useMemo, useState } from "react"
import { ChevronRight, Plus, Tag, Tags } from "lucide-react"
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
} from "@/lib/data/use-budget"
import {
  categorizeBySource,
  setTransactionsLabel,
} from "@/lib/data/transactions"
import { createLabel } from "@/lib/data/labels"
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
import { LabelCombobox } from "@/components/spending/label-combobox"
import { TypeMapper } from "@/components/spending/type-mapper"
import { CategorySelect } from "@/components/spending/category-picker"
import {
  MixedMerchantDialog,
  merchantMix,
  type MerchantMix,
} from "@/components/spending/mixed-merchant-dialog"
import { CategoryTree } from "@/components/settings/category-tree"
import { BankTypeCleanup } from "@/components/settings/bank-type-cleanup"
import { TagsManager } from "@/components/settings/tags-manager"

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
  const typeMap = useMemo(() => buildTypeMap(typeCategories), [typeCategories])

  const refresh = () => {
    mutateTx()
    mutateCats()
    mutateLabels()
    mutateTypeCats()
    mutateRules()
  }

  return (
    <div className="flex flex-col gap-6">
      <CategoryTree />
      <BankTypeCleanup onChanged={refresh} />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <TriagePanel
          transactions={transactions}
          categories={categories}
          labels={labels}
          typeCategories={typeCategories}
          typeMap={typeMap}
          onChanged={refresh}
        />
        <TagsManager onChanged={refresh} />
      </div>
    </div>
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

  const [mixed, setMixed] = useState<{
    mix: MerchantMix
    group: MerchantGroup
    catId: string | null
  } | null>(null)

  function pickMerchant(g: MerchantGroup, catId: string | null) {
    const mix = merchantMix(transactions, g.sample, catId, typeMap, (id) => catName(id) ?? "Uncategorised")
    if (mix) {
      setMixed({ mix, group: g, catId })
      return
    }
    assignMerchant(g, catId)
  }

  async function assignMerchant(g: MerchantGroup, catId: string | null) {
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
            <CardTitle className="text-base">Merchants · needs sorting</CardTitle>
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
                    <div className="w-[190px] shrink-0">
                      <CategorySelect
                        categories={categories}
                        value={cat}
                        onChange={(id) => pickMerchant(g, id)}
                        noneLabel={mixed ? "Mixed / uncategorised" : "Uncategorised"}
                        className="h-8 text-xs"
                      />
                    </div>
                  </div>

                  {isOpen && (
                    <ExpandedMerchant
                      group={g}
                      labels={labels}
                      onChanged={onChanged}
                    />
                  )}
                </div>
              )
            })}
          </div>
        )}
      </CardContent>

      <MixedMerchantDialog
        mix={mixed?.mix ?? null}
        onCancel={() => setMixed(null)}
        onAll={() => {
          if (mixed) {
            assignMerchant(mixed.group, mixed.catId)
          }
          setMixed(null)
        }}
      />

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
  onChanged,
}: {
  group: MerchantGroup
  labels: Label[]
  onChanged: () => void
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const labelName = (id: string | null) =>
    labels.find((l) => l.id === id)?.name ?? null

  async function createAndGetId(name: string): Promise<string> {
    const l = await createLabel(name)
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
