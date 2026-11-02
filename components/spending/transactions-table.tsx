"use client"

import {
  memo,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react"
import {
  ArrowDown,
  ArrowUp,
  Ban,
  Check,
  Filter,
  MoreHorizontal,
  Plus,
  Search,
  Tag,
  Wand2,
  X,
} from "lucide-react"
import { toast } from "sonner"

import type { Category, Label as TxLabel, Transaction } from "@/lib/types"
import type { Flow } from "@/lib/stats/types"
import type { GroupIndex } from "@/lib/stats/flows"
import { formatNOK } from "@/lib/format"
import { RuleDialog } from "@/components/spending/rule-dialog"
import { cn } from "@/lib/utils"
import {
  deriveStem,
  descMatches,
  effectiveCategoryId,
  effectiveDate,
  groupOfCategory,
  hasConflict,
  isInternalTx,
  sourceKeyFor,
  txMatchesSource,
  type TypeMap,
} from "@/lib/spending"
import {
  categorizeBySource,
  resolveConflict,
  setCategoryForIds,
  setTransactionCategory,
  setTransactionExcluded,
  setTransactionLabel,
  setTransactionsLabel,
} from "@/lib/data/transactions"
import { createLabel } from "@/lib/data/labels"
import { LabelPickerList } from "@/components/spending/label-combobox"
import { FloatingPanel } from "@/components/spending/floating-panel"
import {
  MixedMerchantDialog,
  merchantMix,
  type MerchantMix,
} from "@/components/spending/mixed-merchant-dialog"
import {
  CategoryPicker,
  categoryOptions,
} from "@/components/spending/category-picker"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

const NONE = "__none__"
const ANY = "__any__"
const OVERSCAN = 8
const ROW_H = { wide: 52, narrow: 68 }

type FlowKey = Flow | "excluded"
const FLOW_LABEL: Record<FlowKey, string> = {
  spent: "Spent",
  income: "Income",
  refund: "Refund",
  saved: "Saved",
  transfer: "Transfer",
  excluded: "Excluded",
}

type SortKey = "date" | "amount" | "description" | "category" | "group"
type Sort = { key: SortKey; desc: boolean }
type Direction = "all" | "out" | "in"
type Filters = {
  direction: Direction
  flow: FlowKey | null
  showTransfers: boolean
  min: string
  max: string
}
const NO_FILTERS: Filters = {
  direction: "all",
  flow: null,
  showTransfers: false,
  min: "",
  max: "",
}

/** A transaction with everything the list shows, sorts and filters by. */
type Row = {
  t: Transaction
  id: string
  date: string
  sortKey: string
  amount: number
  text: string
  catId: string | null
  catName: string | null
  catGroup: string | null // the category's group name when it's a member
  catLoose: boolean // a category that rolls up into no group
  groupId: string | null
  groupName: string
  tagName: string | null
  flow: FlowKey
  internal: boolean
  conflict: boolean
  needsSorting: boolean
  sourceKey: string | null
}

type Picker =
  | { kind: "category"; anchor: DOMRect; row: Row; only: boolean }
  | { kind: "tag"; anchor: DOMRect; row: Row }
  | { kind: "bulk-category"; anchor: DOMRect }
  | { kind: "bulk-tag"; anchor: DOMRect }

type RowAction = "category" | "category-only" | "tag" | "merchant" | "rule" | "exclude"

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split("-")
  return `${d}.${m}.${y.slice(2)}`
}

const keyOf = (t: Transaction) => {
  const src = sourceKeyFor(t)
  return src ? `${src.matchType}:${src.pattern}` : null
}

const wideQuery = "(min-width: 768px)"
const subscribeWide = (cb: () => void) => {
  const mq = window.matchMedia(wideQuery)
  mq.addEventListener("change", cb)
  return () => mq.removeEventListener("change", cb)
}

/** Which slice of a window-scrolled list of fixed-height rows is on screen. */
function useWindowRange(
  ref: React.RefObject<HTMLDivElement | null>,
  count: number,
  rowH: number,
) {
  const [range, setRange] = useState({ start: 0, end: 40 })
  useEffect(() => {
    let raf = 0
    const update = () => {
      raf = 0
      const el = ref.current
      if (!el) {
        return
      }
      const top = el.getBoundingClientRect().top
      const start = Math.max(0, Math.floor(-top / rowH) - OVERSCAN)
      const end = Math.min(
        count,
        Math.ceil((window.innerHeight - top) / rowH) + OVERSCAN,
      )
      setRange((r) => (r.start === start && r.end === end ? r : { start, end }))
    }
    const schedule = () => {
      if (!raf) {
        raf = requestAnimationFrame(update)
      }
    }
    schedule()
    window.addEventListener("scroll", schedule, { passive: true })
    window.addEventListener("resize", schedule)
    return () => {
      window.removeEventListener("scroll", schedule)
      window.removeEventListener("resize", schedule)
      if (raf) {
        cancelAnimationFrame(raf)
      }
    }
  }, [ref, count, rowH])
  return range
}

export function TransactionsTable({
  transactions,
  allTransactions,
  categories,
  labels,
  typeMap,
  groupIndex,
  flowById,
  query,
  onQueryChange,
  highlight,
  categoryFilter,
  labelFilter,
  onCategoryFilterChange,
  onLabelFilterChange,
  groupFilter,
  onGroupFilterChange,
  needsSorting,
  onNeedsSortingChange,
  onChanged,
  onLabelsChanged,
}: {
  transactions: Transaction[]
  /** Every imported row: a category change covers the merchant across all time. */
  allTransactions: Transaction[]
  categories: Category[]
  labels: TxLabel[]
  typeMap: TypeMap
  groupIndex: GroupIndex
  flowById: Map<string, Flow>
  query: string
  onQueryChange: (q: string) => void
  /** A Bills/Income drill target: highlight this merchant in this exact month. */
  highlight?: { merchant: string; period: string } | null
  /** Show only transactions whose resolved category is this one. */
  categoryFilter: string | null
  /** Show only transactions with this tag ("__none__" = untagged). */
  labelFilter: string | null
  onCategoryFilterChange: (id: string | null) => void
  onLabelFilterChange: (id: string | null) => void
  /** Show only transactions placed in this group ("__none__" = no group). */
  groupFilter: string | null
  onGroupFilterChange: (id: string | null) => void
  needsSorting: boolean
  onNeedsSortingChange: (on: boolean) => void
  onChanged: () => void
  onLabelsChanged: () => void
}) {
  const [filters, setFilters] = useState<Filters>(NO_FILTERS)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [sort, setSort] = useState<Sort>({ key: "date", desc: true })
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [picker, setPicker] = useState<Picker | null>(null)
  const [bulkOnly, setBulkOnly] = useState(false)
  const [mixed, setMixed] = useState<{
    mix: MerchantMix
    row: Row
    categoryId: string | null
  } | null>(null)
  const [ruleTx, setRuleTx] = useState<Transaction | null>(null)
  const deferredQuery = useDeferredValue(query)

  const setFilter = <K extends keyof Filters>(key: K, value: Filters[K]) =>
    setFilters((f) => ({ ...f, [key]: value }))

  const catById = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories],
  )
  const groupIds = useMemo(
    () => new Set(groupIndex.groups.map((g) => g.id)),
    [groupIndex],
  )
  const options = useMemo(
    () => categoryOptions(categories),
    [categories],
  )
  const tagName = useMemo(
    () => new Map(labels.map((l) => [l.id, l.name])),
    [labels],
  )
  // How many rows a merchant-wide change reaches, matched exactly the way
  // categorizeBySource matches them (stem-aware, all time).
  const reachOf = useCallback(
    (txs: Transaction[]) => {
      const sources = new Map<string, { matchType: "description" | "account"; pattern: string }>()
      const ids = new Set<string>()
      for (const t of txs) {
        const src = sourceKeyFor(t)
        if (src) {
          sources.set(`${src.matchType}:${src.pattern}`, src)
        }
        ids.add(t.id)
      }
      const list = [...sources.values()]
      for (const t of allTransactions) {
        if (list.some((src) => txMatchesSource(t, src.matchType, src.pattern))) {
          ids.add(t.id)
        }
      }
      return { rows: ids.size, merchants: sources.size || txs.length }
    },
    [allTransactions],
  )

  const rows = useMemo<Row[]>(
    () =>
      transactions.map((t) => {
        const date = effectiveDate(t)
        const catId = effectiveCategoryId(t, typeMap)
        const catGroupId = groupOfCategory(catId, groupIds, catById)
        const groupId = groupIndex.groupOf(t)
        const internal = isInternalTx(t)
        const flow: FlowKey = t.is_excluded
          ? "excluded"
          : (flowById.get(t.id) ?? "spent")
        return {
          t,
          id: t.id,
          date,
          // Same-day card buys order by time when the timestamp is that day.
          sortKey: t.tx_at && t.tx_at.slice(0, 10) === date ? t.tx_at : date,
          amount: Number(t.amount),
          text: t.description || t.type || "—",
          catId,
          catName: catId ? (catById.get(catId)?.name ?? null) : null,
          catGroup:
            catGroupId && catGroupId !== catId
              ? (catById.get(catGroupId)?.name ?? null)
              : null,
          catLoose: !!catId && !catGroupId,
          groupId,
          groupName: groupIndex.nameOf(groupId),
          tagName: t.label_id ? (tagName.get(t.label_id) ?? "Tag") : null,
          flow,
          internal,
          conflict: hasConflict(t),
          needsSorting: !t.is_excluded && !internal && !groupId,
          sourceKey: keyOf(t),
        }
      }),
    [transactions, typeMap, groupIds, catById, groupIndex, flowById, tagName],
  )

  const visible = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase()
    const min = filters.min ? Number(filters.min) : null
    const max = filters.max ? Number(filters.max) : null
    const showTransfers =
      filters.showTransfers ||
      filters.flow === "transfer" ||
      filters.flow === "saved"
    const out = rows.filter((r) => {
      if (!showTransfers && r.internal) {
        return false
      }
      if (categoryFilter && r.catId !== categoryFilter) {
        return false
      }
      if (labelFilter === NONE ? !!r.t.label_id : labelFilter && r.t.label_id !== labelFilter) {
        return false
      }
      if (groupFilter && (groupFilter === NONE ? r.groupId : r.groupId !== groupFilter)) {
        return false
      }
      if (filters.direction === "out" ? r.amount >= 0 : filters.direction === "in" && r.amount <= 0) {
        return false
      }
      if (filters.flow && r.flow !== filters.flow) {
        return false
      }
      if (needsSorting && !r.needsSorting) {
        return false
      }
      if ((min != null && Math.abs(r.amount) < min) || (max != null && Math.abs(r.amount) > max)) {
        return false
      }
      if (!q) {
        return true
      }
      return (
        // Stem-aware so a drilled merchant key (e.g. "compass hi") matches
        // "COMPASS 5105 HI" with interior digits.
        descMatches(r.t.description, q) ||
        (r.t.type ?? "").toLowerCase().includes(q) ||
        (r.t.message ?? "").toLowerCase().includes(q) ||
        (r.t.to_account ?? "").includes(q) ||
        (r.t.from_account ?? "").includes(q) ||
        (r.tagName ?? "").toLowerCase().includes(q) ||
        (r.catName ?? "").toLowerCase().includes(q) ||
        (r.groupId ? r.groupName : "").toLowerCase().includes(q)
      )
    })
    const text = (a: string | null, b: string | null) =>
      (a ?? "￿").localeCompare(b ?? "￿")
    const cmp: Record<SortKey, (a: Row, b: Row) => number> = {
      date: (a, b) => a.sortKey.localeCompare(b.sortKey),
      amount: (a, b) => a.amount - b.amount,
      description: (a, b) => a.text.localeCompare(b.text),
      category: (a, b) => text(a.catName, b.catName),
      group: (a, b) => text(a.groupId ? a.groupName : null, b.groupId ? b.groupName : null),
    }
    const dir = sort.desc ? -1 : 1
    return out.sort(
      (a, b) => dir * cmp[sort.key](a, b) || b.sortKey.localeCompare(a.sortKey),
    )
  }, [rows, deferredQuery, filters, categoryFilter, labelFilter, groupFilter, needsSorting, sort])

  const needsSortingCount = useMemo(
    () => rows.filter((r) => r.needsSorting).length,
    [rows],
  )
  const conflictCount = useMemo(
    () => transactions.filter(hasConflict).length,
    [transactions],
  )
  const selectedRows = useMemo(
    () => visible.filter((r) => selected.has(r.id)),
    [visible, selected],
  )

  /* ------------------------------------------------------------ selection */

  // Click toggles a row; press-and-drag paints every row it crosses with the
  // state the first row toggled to; shift-click paints from the last click.
  const visibleRef = useRef(visible)
  const selectedRef = useRef(selected)
  useEffect(() => {
    visibleRef.current = visible
    selectedRef.current = selected
  })
  const drag = useRef<{ start: number; on: boolean; base: Set<string> } | null>(null)
  const anchor = useRef<number | null>(null)

  const paint = useCallback(
    (base: Set<string>, from: number, to: number, on: boolean) => {
      const next = new Set(base)
      const list = visibleRef.current
      for (let i = Math.min(from, to); i <= Math.max(from, to); i++) {
        if (on) {
          next.add(list[i].id)
        } else {
          next.delete(list[i].id)
        }
      }
      setSelected(next)
    },
    [],
  )
  const selectStart = useCallback(
    (index: number, shift: boolean) => {
      const id = visibleRef.current[index].id
      const on = !selectedRef.current.has(id)
      if (shift && anchor.current != null) {
        paint(selectedRef.current, anchor.current, index, on)
      } else {
        drag.current = { start: index, on, base: selectedRef.current }
        paint(selectedRef.current, index, index, on)
      }
      anchor.current = index
    },
    [paint],
  )
  const selectEnter = useCallback(
    (index: number) => {
      const d = drag.current
      if (d) {
        paint(d.base, d.start, index, d.on)
      }
    },
    [paint],
  )
  const toggle = useCallback((index: number) => {
    const id = visibleRef.current[index].id
    anchor.current = index
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || selectedRef.current.size === 0) {
        return
      }
      if (document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]')) {
        return
      }
      setSelected(new Set())
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])
  useEffect(() => {
    const end = () => {
      drag.current = null
    }
    window.addEventListener("pointerup", end)
    window.addEventListener("pointercancel", end)
    return () => {
      window.removeEventListener("pointerup", end)
      window.removeEventListener("pointercancel", end)
    }
  }, [])

  /* ------------------------------------------------------------- actions */

  const closePicker = useCallback(() => setPicker(null), [])

  async function run(fn: () => Promise<unknown>, err: string) {
    try {
      await fn()
      onChanged()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : err)
    }
  }

  const catLabel = (id: string | null) => {
    const o = options.find((x) => x.id === id)
    return o ? (o.group && o.group !== "No group" ? `${o.group} › ${o.name}` : o.name) : "Uncategorised"
  }

  const applyOnly = (row: Row, categoryId: string | null) =>
    run(async () => {
      await setTransactionCategory(row.id, categoryId)
      toast.success(`This transaction → ${catLabel(categoryId)}.`)
    }, "Could not update category.")

  const applyMerchant = (row: Row, categoryId: string | null) =>
    run(async () => {
      const n = await categorizeBySource(row.t, categoryId)
      toast.success(
        `${row.text} → ${catLabel(categoryId)}, applied to all ${n} transaction${n === 1 ? "" : "s"}.`,
      )
    }, "Could not update category.")

  async function pickCategory(categoryId: string | null) {
    const p = picker
    setPicker(null)
    if (p?.kind === "category") {
      if (p.only) {
        await applyOnly(p.row, categoryId)
        return
      }
      // Rows of this merchant spread over several categories: ask first.
      const mix = merchantMix(allTransactions, p.row.t, categoryId, typeMap, catLabel)
      if (mix) {
        setMixed({ mix, row: p.row, categoryId })
        return
      }
      await applyMerchant(p.row, categoryId)
    } else if (p?.kind === "bulk-category") {
      const list = selectedRows
      await run(async () => {
        if (bulkOnly) {
          await setCategoryForIds(list.map((r) => r.id), categoryId)
          toast.success(`${list.length} transaction(s) → ${catLabel(categoryId)}.`)
          return
        }
        // One decision per merchant covers its whole history.
        const samples = new Map<string, Transaction>()
        for (const r of list) {
          samples.set(r.sourceKey ?? r.id, r.t)
        }
        let n = 0
        for (const t of samples.values()) {
          n += await categorizeBySource(t, categoryId)
        }
        toast.success(
          `${samples.size} merchant(s) → ${catLabel(categoryId)}, applied to ${n} transaction(s).`,
        )
      }, "Could not update category.")
      setSelected(new Set())
    }
  }

  async function createTag(name: string): Promise<string> {
    const l = await createLabel(name)
    onLabelsChanged()
    return l.id
  }

  async function pickTag(labelId: string | null) {
    const p = picker
    if (p?.kind === "tag") {
      await run(() => setTransactionLabel(p.row.id, labelId), "Could not set tag.")
    } else if (p?.kind === "bulk-tag") {
      const ids = selectedRows.map((r) => r.id)
      await run(async () => {
        await setTransactionsLabel(ids, labelId)
        toast.success(
          labelId
            ? `Tagged ${ids.length} transaction(s).`
            : `Cleared the tag on ${ids.length} transaction(s).`,
        )
      }, "Could not apply tag.")
      setSelected(new Set())
    }
  }

  async function bulkExclude() {
    const list = selectedRows
    const include = list.every((r) => r.t.is_excluded)
    await run(async () => {
      await Promise.all(
        list
          .filter((r) => r.t.is_excluded !== !include)
          .map((r) => setTransactionExcluded(r.id, !include)),
      )
      toast.success(
        `${include ? "Included" : "Excluded"} ${list.length} transaction(s).`,
      )
    }, "Could not update.")
    setSelected(new Set())
  }

  const onRowAction = useCallback(
    (row: Row, action: RowAction, el: HTMLElement) => {
      const anchorRect = el.getBoundingClientRect()
      if (action === "category" || action === "category-only") {
        setPicker({ kind: "category", anchor: anchorRect, row, only: action === "category-only" })
      } else if (action === "tag") {
        setPicker({ kind: "tag", anchor: anchorRect, row })
      } else if (action === "merchant") {
        onQueryChange(deriveStem(row.t.description) || row.t.type || "")
      } else if (action === "rule") {
        setRuleTx(row.t)
      } else {
        setTransactionExcluded(row.id, !row.t.is_excluded)
          .then(onChanged)
          .catch((e) => toast.error(e instanceof Error ? e.message : "Could not update."))
      }
    },
    [onChanged, onQueryChange],
  )

  const onResolve = useCallback(
    (t: Transaction, keep: "new" | "old") => {
      resolveConflict(t, keep)
        .then(onChanged)
        .catch((e) => toast.error(e instanceof Error ? e.message : "Could not resolve."))
    },
    [onChanged],
  )

  /* --------------------------------------------------------- virtual list */

  const wide = useSyncExternalStore(
    subscribeWide,
    () => window.matchMedia(wideQuery).matches,
    () => true,
  )
  const rowH = wide ? ROW_H.wide : ROW_H.narrow
  const listRef = useRef<HTMLDivElement>(null)
  const { start, end } = useWindowRange(listRef, visible.length, rowH)

  // A row is a drill hit when it matches the merchant AND the exact month.
  const isHit = useCallback(
    (r: Row) =>
      !!highlight &&
      r.date.slice(0, 7) === highlight.period &&
      descMatches(r.t.description, highlight.merchant),
    [highlight],
  )
  const firstHit = useMemo(
    () => (highlight ? visible.findIndex(isHit) : -1),
    [visible, highlight, isHit],
  )
  useEffect(() => {
    if (firstHit < 0) {
      return
    }
    const raf = requestAnimationFrame(() => {
      const el = listRef.current
      if (el) {
        const top = el.getBoundingClientRect().top + window.scrollY
        window.scrollTo({
          top: top + firstHit * rowH - window.innerHeight / 2,
          behavior: "smooth",
        })
      }
    })
    return () => cancelAnimationFrame(raf)
  }, [firstHit, rowH])

  /* ------------------------------------------------------------------ UI */

  const activeChips: { key: string; label: string; clear: () => void }[] = [
    categoryFilter && {
      key: "cat",
      label: catLabel(categoryFilter),
      clear: () => onCategoryFilterChange(null),
    },
    labelFilter && {
      key: "tag",
      label: labelFilter === NONE ? "No tag" : `Tag: ${tagName.get(labelFilter) ?? "Tag"}`,
      clear: () => onLabelFilterChange(null),
    },
    groupFilter && {
      key: "group",
      label:
        groupFilter === NONE
          ? "No group"
          : `Group: ${groupIndex.nameOf(groupFilter)}`,
      clear: () => onGroupFilterChange(null),
    },
    filters.direction !== "all" && {
      key: "dir",
      label: filters.direction === "out" ? "Money out" : "Money in",
      clear: () => setFilter("direction", "all"),
    },
    filters.flow && {
      key: "flow",
      label: FLOW_LABEL[filters.flow],
      clear: () => setFilter("flow", null),
    },
    (filters.min || filters.max) && {
      key: "amount",
      label: `${filters.min || "0"}–${filters.max || "∞"} kr`,
      clear: () => setFilters((f) => ({ ...f, min: "", max: "" })),
    },
  ].filter(Boolean) as { key: string; label: string; clear: () => void }[]

  const clearAll = () => {
    setFilters((f) => ({ ...NO_FILTERS, showTransfers: f.showTransfers }))
    onCategoryFilterChange(null)
    onLabelFilterChange(null)
    onGroupFilterChange(null)
    onNeedsSortingChange(false)
    onQueryChange("")
  }

  const totals = useMemo(() => {
    let out = 0
    let inn = 0
    for (const r of visible) {
      if (r.amount < 0) {
        out -= r.amount
      } else {
        inn += r.amount
      }
    }
    return { out, inn }
  }, [visible])
  const selectedSum = selectedRows.reduce((s, r) => s + r.amount, 0)
  const bulkReach = useMemo(
    () =>
      picker?.kind === "bulk-category"
        ? reachOf(selectedRows.map((r) => r.t))
        : { rows: 0, merchants: 0 },
    [picker, selectedRows, reachOf],
  )
  const allSelected = visible.length > 0 && selectedRows.length === visible.length

  const sortHeader = (key: SortKey, label: string, className?: string) => (
    <button
      type="button"
      onClick={() =>
        setSort((s) =>
          // First click: newest dates, biggest spend (most negative), A–Z.
          s.key === key ? { key, desc: !s.desc } : { key, desc: key === "date" },
        )
      }
      className={cn(
        "hover:text-foreground inline-flex items-center gap-1 text-[11px] font-medium tracking-wider uppercase",
        sort.key === key && "text-foreground",
        className,
      )}
    >
      {label}
      {sort.key === key &&
        (sort.desc ? <ArrowDown className="size-3" /> : <ArrowUp className="size-3" />)}
    </button>
  )

  const pickerCount = useMemo(
    () => (picker?.kind === "category" && !picker.only ? reachOf([picker.row.t]).rows : 1),
    [picker, reachOf],
  )

  return (
    <div className="flex flex-col gap-3">
      {/* Search, quick toggles and the filter panel */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:max-w-xs">
          <Search className="text-muted-foreground absolute top-2.5 left-2.5 size-4" />
          <Input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Search merchant, tag, category, group, message…"
            className="pl-8"
          />
        </div>
        <Button
          variant={filtersOpen ? "secondary" : "outline"}
          size="sm"
          onClick={() => setFiltersOpen((o) => !o)}
          aria-expanded={filtersOpen}
        >
          <Filter className="size-4" />
          Filters
          {activeChips.length > 0 && (
            <span className="bg-primary text-primary-foreground px-1.5 text-[10px] tabular-nums">
              {activeChips.length}
            </span>
          )}
        </Button>
        <Button
          variant={needsSorting ? "secondary" : "outline"}
          size="sm"
          onClick={() => onNeedsSortingChange(!needsSorting)}
          aria-pressed={needsSorting}
        >
          Needs sorting
          <span
            className={cn(
              "tabular-nums",
              needsSortingCount > 0 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground",
            )}
          >
            {needsSortingCount}
          </span>
        </Button>
        <label className="text-muted-foreground flex cursor-pointer items-center gap-1.5 text-sm">
          <input
            type="checkbox"
            checked={filters.showTransfers}
            onChange={(e) => setFilter("showTransfers", e.target.checked)}
          />
          Show transfers
        </label>
        {conflictCount > 0 && (
          <Badge
            variant="outline"
            className="border-amber-500/40 text-amber-600 dark:text-amber-400"
          >
            {conflictCount} to review
          </Badge>
        )}
        {!wide && visible.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              setSelected(allSelected ? new Set() : new Set(visible.map((r) => r.id)))
            }
          >
            {allSelected ? "Select none" : "Select all"}
          </Button>
        )}
        {!wide && (
          <Select
            value={`${sort.key}:${sort.desc ? "desc" : "asc"}`}
            onValueChange={(v) => {
              const [key, dir] = v.split(":")
              setSort({ key: key as SortKey, desc: dir === "desc" })
            }}
          >
            <SelectTrigger size="sm" className="ml-auto w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="date:desc">Newest first</SelectItem>
              <SelectItem value="date:asc">Oldest first</SelectItem>
              <SelectItem value="amount:asc">Biggest spend</SelectItem>
              <SelectItem value="amount:desc">Biggest income</SelectItem>
              <SelectItem value="description:asc">Merchant A–Z</SelectItem>
              <SelectItem value="category:asc">Category A–Z</SelectItem>
              <SelectItem value="group:asc">Group A–Z</SelectItem>
            </SelectContent>
          </Select>
        )}
      </div>

      {filtersOpen && (
        <div className="grid gap-3 border p-3 sm:grid-cols-2 lg:grid-cols-4">
          <FilterSelect
            label="Group"
            value={groupFilter}
            onChange={onGroupFilterChange}
            items={[
              ...groupIndex.groups.map((g) => ({ value: g.id, label: g.name })),
              { value: NONE, label: "No group (needs sorting)" },
            ]}
          />
          <FilterSelect
            label="Category"
            value={categoryFilter}
            onChange={onCategoryFilterChange}
            items={options.map((o) => ({
              value: o.id,
              label: o.group && o.group !== "No group" ? `${o.group} › ${o.name}` : o.name,
            }))}
          />
          <FilterSelect
            label="Tag"
            value={labelFilter}
            onChange={onLabelFilterChange}
            items={[
              { value: NONE, label: "No tag" },
              ...[...labels]
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((l) => ({ value: l.id, label: l.name })),
            ]}
          />
          <FilterSelect
            label="Counts as"
            value={filters.flow}
            onChange={(v) => setFilter("flow", v as FlowKey | null)}
            items={(Object.keys(FLOW_LABEL) as FlowKey[]).map((f) => ({
              value: f,
              label: FLOW_LABEL[f],
            }))}
          />
          <div className="grid gap-1.5">
            <span className="text-muted-foreground text-xs font-medium">Direction</span>
            <div className="flex border" role="radiogroup" aria-label="Direction">
              {(["all", "out", "in"] as Direction[]).map((d) => (
                <button
                  key={d}
                  type="button"
                  role="radio"
                  aria-checked={filters.direction === d}
                  onClick={() => setFilter("direction", d)}
                  className={cn(
                    "h-9 flex-1 text-xs font-semibold tracking-wider uppercase",
                    filters.direction === d
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {d === "all" ? "All" : d === "out" ? "Out" : "In"}
                </button>
              ))}
            </div>
          </div>
          <div className="grid gap-1.5">
            <span className="text-muted-foreground text-xs font-medium">Amount (kr)</span>
            <div className="flex items-center gap-2">
              <Input
                inputMode="decimal"
                placeholder="Min"
                value={filters.min}
                onChange={(e) => setFilter("min", e.target.value.replace(/[^\d.]/g, ""))}
                className="h-9"
              />
              <span className="text-muted-foreground">–</span>
              <Input
                inputMode="decimal"
                placeholder="Max"
                value={filters.max}
                onChange={(e) => setFilter("max", e.target.value.replace(/[^\d.]/g, ""))}
                className="h-9"
              />
            </div>
          </div>
        </div>
      )}

      {(activeChips.length > 0 || query) && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {activeChips.map((c) => (
            <Badge key={c.key} variant="secondary" className="gap-1 font-normal">
              {c.label}
              <button
                type="button"
                aria-label={`Clear ${c.label}`}
                onClick={c.clear}
                className="hover:text-foreground"
              >
                <X className="size-3" />
              </button>
            </Badge>
          ))}
          <button
            type="button"
            onClick={clearAll}
            className="text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
          >
            Clear all
          </button>
        </div>
      )}

      <p className="text-muted-foreground text-xs">
        Click a row to select it · drag across rows to select many · shift-click
        for a range. Changing a category applies to every transaction from that
        merchant.
      </p>

      {/* The list */}
      <div className="border">
        {visible.length > 0 && (
          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b px-3 py-2.5 tabular-nums">
            <span className="text-muted-foreground text-xs">
              {visible.length.toLocaleString("nb-NO")} transaction
              {visible.length === 1 ? "" : "s"}
              {visible.length !== rows.length &&
                ` of ${rows.length.toLocaleString("nb-NO")} · filtered`}
            </span>
            <span className="flex flex-wrap items-baseline gap-x-5 gap-y-1 text-sm">
              <span>
                <span className="text-muted-foreground text-xs">Out </span>
                <span className="font-semibold">{formatNOK(totals.out)}</span>
              </span>
              <span>
                <span className="text-muted-foreground text-xs">In </span>
                <span className="font-semibold">{formatNOK(totals.inn)}</span>
              </span>
              <span>
                <span className="text-muted-foreground text-xs">Net </span>
                <span
                  className={cn(
                    "font-semibold",
                    totals.inn - totals.out > 0 && "text-emerald-600 dark:text-emerald-400",
                  )}
                >
                  {formatNOK(totals.inn - totals.out)}
                </span>
              </span>
            </span>
          </div>
        )}
        <div className="bg-muted text-muted-foreground hidden h-10 grid-cols-[28px_76px_minmax(0,1fr)_minmax(0,220px)_minmax(0,140px)_112px_36px] items-center gap-x-3 border-b px-2 md:grid">
          <input
            type="checkbox"
            aria-label="Select all shown"
            checked={allSelected}
            onChange={(e) =>
              setSelected(e.target.checked ? new Set(visible.map((r) => r.id)) : new Set())
            }
            className="justify-self-center"
          />
          {sortHeader("date", "Date")}
          {sortHeader("description", "Description")}
          <span className="flex items-center gap-1">
            {sortHeader("group", "Group")}
            <span className="text-[11px]">›</span>
            {sortHeader("category", "Category")}
          </span>
          <span className="text-[11px] font-medium tracking-wider uppercase">Tag</span>
          {sortHeader("amount", "Amount", "justify-self-end")}
          <span />
        </div>

        {visible.length === 0 ? (
          <div className="text-muted-foreground flex flex-col items-center gap-2 py-10 text-sm">
            {rows.length === 0
              ? "No transactions in this period."
              : "No transactions match these filters."}
            {rows.length > 0 && (
              <Button variant="outline" size="sm" onClick={clearAll}>
                Clear filters
              </Button>
            )}
          </div>
        ) : (
          <div
            ref={listRef}
            className="relative select-none"
            style={{ height: visible.length * rowH }}
          >
            <div style={{ transform: `translateY(${start * rowH}px)` }}>
              {visible.slice(start, end).map((r, i) => (
                <TxRow
                  key={r.id}
                  row={r}
                  index={start + i}
                  height={rowH}
                  selected={selected.has(r.id)}
                  hit={isHit(r)}
                  onSelectStart={selectStart}
                  onSelectEnter={selectEnter}
                  onToggle={toggle}
                  onAction={onRowAction}
                  onResolve={onResolve}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Bulk actions */}
      {selectedRows.length > 0 && (
        <div className="bg-background/95 supports-backdrop-filter:backdrop-blur sticky bottom-3 z-20 flex flex-wrap items-center gap-2 border border-primary/40 px-3 py-2 text-sm shadow-lg">
          <span className="font-medium tabular-nums">
            {selectedRows.length} selected
          </span>
          <span className="text-muted-foreground text-xs tabular-nums">
            {formatNOK(selectedSum)}
          </span>
          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            <Button
              size="sm"
              onClick={(e) => {
                setBulkOnly(false)
                setPicker({ kind: "bulk-category", anchor: e.currentTarget.getBoundingClientRect() })
              }}
            >
              Category…
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={(e) =>
                setPicker({ kind: "bulk-tag", anchor: e.currentTarget.getBoundingClientRect() })
              }
            >
              <Tag className="size-3.5" />
              Tag…
            </Button>
            <Button size="sm" variant="outline" onClick={bulkExclude}>
              <Ban className="size-3.5" />
              {selectedRows.every((r) => r.t.is_excluded) ? "Include" : "Exclude"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              aria-label="Deselect"
              onClick={() => setSelected(new Set())}
            >
              <X className="size-3.5" />
              <span className="hidden sm:inline">Deselect</span>
            </Button>
          </div>
        </div>
      )}

      {picker && (
        <FloatingPanel
          anchor={picker.anchor}
          width={picker.kind === "category" || picker.kind === "bulk-category" ? 300 : 240}
          onClose={closePicker}
        >
          {picker.kind === "category" || picker.kind === "bulk-category" ? (
            <CategoryPicker
              options={options}
              value={picker.kind === "category" ? picker.row.catId : null}
              onPick={pickCategory}
              header={
                picker.kind === "category" ? (
                  picker.only ? (
                    <span>
                      <span className="font-medium">Only this transaction</span>{" "}
                      <span className="text-muted-foreground">· an exception to its merchant</span>
                    </span>
                  ) : (
                    <span>
                      Applies to{" "}
                      <span className="font-medium">
                        all {pickerCount} transaction{pickerCount === 1 ? "" : "s"}
                      </span>{" "}
                      from <span className="font-medium">{picker.row.text}</span>, now and
                      on future imports
                    </span>
                  )
                ) : (
                  <div className="flex flex-col gap-1.5">
                    <span className="text-muted-foreground">Apply to</span>
                    {[false, true].map((only) => (
                      <label key={String(only)} className="flex cursor-pointer items-center gap-2">
                        <input
                          type="radio"
                          name="bulk-scope"
                          checked={bulkOnly === only}
                          onChange={() => setBulkOnly(only)}
                        />
                        {only
                          ? `Only the ${selectedRows.length} selected`
                          : `All ${bulkReach.rows} from these ${bulkReach.merchants} merchant${bulkReach.merchants === 1 ? "" : "s"}`}
                      </label>
                    ))}
                  </div>
                )
              }
            />
          ) : (
            <LabelPickerList
              labels={labels}
              value={picker.kind === "tag" ? picker.row.t.label_id : undefined}
              allowClear={picker.kind === "bulk-tag"}
              onPick={pickTag}
              onCreate={createTag}
              onDone={closePicker}
              autoFocus={wide}
              listClassName="min-h-0 flex-1"
            />
          )}
        </FloatingPanel>
      )}

      <MixedMerchantDialog
        mix={mixed?.mix ?? null}
        onCancel={() => setMixed(null)}
        onAll={() => {
          if (mixed) {
            applyMerchant(mixed.row, mixed.categoryId)
          }
          setMixed(null)
        }}
        onOnlyThis={() => {
          if (mixed) {
            applyOnly(mixed.row, mixed.categoryId)
          }
          setMixed(null)
        }}
      />

      <RuleDialog
        open={!!ruleTx}
        tx={ruleTx}
        rule={null}
        onClose={() => setRuleTx(null)}
        onSaved={onChanged}
      />
    </div>
  )
}

function FilterSelect({
  label,
  value,
  onChange,
  items,
}: {
  label: string
  value: string | null
  onChange: (v: string | null) => void
  items: { value: string; label: string }[]
}) {
  return (
    <div className="grid gap-1.5">
      <span className="text-muted-foreground text-xs font-medium">{label}</span>
      <Select
        value={value ?? ANY}
        onValueChange={(v) => onChange(v === ANY ? null : v)}
      >
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY}>Any</SelectItem>
          {items.map((i) => (
            <SelectItem key={i.value} value={i.value}>
              {i.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

/** Inline controls that must not toggle the row's selection. */
const NO_SELECT = "[data-no-select]"

const TxRow = memo(function TxRow({
  row: r,
  index,
  height,
  selected,
  hit,
  onSelectStart,
  onSelectEnter,
  onToggle,
  onAction,
  onResolve,
}: {
  row: Row
  index: number
  height: number
  selected: boolean
  hit: boolean
  onSelectStart: (index: number, shift: boolean) => void
  onSelectEnter: (index: number) => void
  onToggle: (index: number) => void
  onAction: (row: Row, action: RowAction, el: HTMLElement) => void
  onResolve: (t: Transaction, keep: "new" | "old") => void
}) {
  const t = r.t
  const income = r.amount > 0 && !r.internal
  return (
    <div
      data-tx-row
      aria-selected={selected}
      style={{ height }}
      onPointerDown={(e) => {
        // Mouse: select on press so a drag can paint a range. Touch selects on
        // tap (below) so scrolling the list never selects anything.
        if (e.pointerType !== "mouse" || e.button !== 0) {
          return
        }
        if ((e.target as HTMLElement).closest(NO_SELECT)) {
          return
        }
        e.preventDefault()
        onSelectStart(index, e.shiftKey)
      }}
      onPointerEnter={() => onSelectEnter(index)}
      onClick={(e) => {
        if ((e.nativeEvent as PointerEvent).pointerType === "mouse") {
          return
        }
        if ((e.target as HTMLElement).closest(NO_SELECT)) {
          return
        }
        onToggle(index)
      }}
      className={cn(
        "grid cursor-pointer grid-cols-[24px_minmax(0,1fr)_auto_32px] grid-rows-2 items-center gap-x-2 border-b px-2 md:grid-cols-[28px_76px_minmax(0,1fr)_minmax(0,220px)_minmax(0,140px)_112px_36px] md:grid-rows-1 md:gap-x-3",
        "hover:bg-muted/50",
        t.is_excluded && "text-muted-foreground",
        r.conflict && "bg-amber-500/5",
        hit && "bg-primary/10",
        selected && "bg-primary/10 hover:bg-primary/15",
      )}
    >
      <input
        data-no-select
        type="checkbox"
        aria-label="Select transaction"
        checked={selected}
        onChange={() => onToggle(index)}
        className="row-span-2 justify-self-center md:row-span-1"
      />

      <div className="col-start-2 row-start-1 min-w-0 md:col-start-3">
        <div className={cn("truncate font-medium", t.is_excluded && "line-through")}>
          {r.text}
        </div>
        <div className="text-muted-foreground flex items-center gap-1.5 truncate text-xs">
          <span className="truncate">
            {t.type}
            {t.message && ` · ${t.message}`}
          </span>
          {r.flow !== "spent" && r.flow !== "income" && (
            <span className="shrink-0 border px-1 text-[10px] tracking-wide uppercase">
              {FLOW_LABEL[r.flow]}
            </span>
          )}
        </div>
      </div>

      {/* Phones: date, category and tag share the second line. */}
      <div className="col-start-2 row-start-2 flex min-w-0 items-center gap-2 md:contents">
        <span className="text-muted-foreground shrink-0 text-xs tabular-nums md:col-start-2 md:row-start-1 md:text-sm">
          {fmtDate(r.date)}
        </span>
        <button
          data-no-select
          type="button"
          onClick={(e) => onAction(r, "category", e.currentTarget)}
          title="Change category for this merchant"
          className="hover:border-input flex min-w-0 items-center gap-1 border border-transparent px-1.5 py-1 text-left text-xs md:col-start-4 md:row-start-1"
        >
          {r.catName ? (
            <>
              {r.catGroup && (
                <span className="text-muted-foreground hidden shrink-0 lg:inline">
                  {r.catGroup} ›
                </span>
              )}
              <span className="truncate">{r.catName}</span>
              {r.catLoose && (
                <span
                  className="size-1.5 shrink-0 bg-amber-500"
                  title="This category isn't in a group yet"
                />
              )}
            </>
          ) : (
            <span className="flex min-w-0 items-center gap-1 text-amber-700 dark:text-amber-400">
              <span className="size-1.5 shrink-0 bg-amber-500" />
              <span className="truncate">Needs sorting</span>
            </span>
          )}
        </button>
        <button
          data-no-select
          type="button"
          onClick={(e) => onAction(r, "tag", e.currentTarget)}
          className={cn(
            "flex min-w-0 items-center gap-1 px-1.5 py-1 text-xs md:col-start-5 md:row-start-1",
            r.tagName
              ? "bg-secondary text-secondary-foreground"
              : "text-muted-foreground/70 hover:text-foreground",
          )}
        >
          {r.tagName ? <Tag className="size-3 shrink-0" /> : <Plus className="size-3 shrink-0" />}
          <span className="truncate">{r.tagName ?? "Tag"}</span>
        </button>
      </div>

      <div className="col-start-3 row-start-1 text-right whitespace-nowrap md:col-start-6">
        {r.conflict ? (
          <div data-no-select className="flex flex-col items-end text-xs">
            <button
              type="button"
              onClick={() => onResolve(t, "old")}
              className="flex items-center gap-1 text-rose-600 line-through dark:text-rose-400"
              title="Keep the old value"
            >
              <Check className="size-3" />
              {formatNOK(r.amount)}
            </button>
            <button
              type="button"
              onClick={() => onResolve(t, "new")}
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
              income && "text-emerald-600 dark:text-emerald-400",
            )}
          >
            {formatNOK(r.amount)}
          </span>
        )}
      </div>

      <div data-no-select className="col-start-4 row-span-2 md:col-start-7 md:row-span-1">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Actions">
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onSelect={(e) => onAction(r, "category-only", e.currentTarget as HTMLElement)}
            >
              Category for this one only…
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={(e) => onAction(r, "merchant", e.currentTarget as HTMLElement)}
            >
              <Search className="size-4" />
              Show all from this merchant
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={(e) => onAction(r, "rule", e.currentTarget as HTMLElement)}
            >
              <Wand2 className="size-4" />
              Make a rule…
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={(e) => onAction(r, "exclude", e.currentTarget as HTMLElement)}
            >
              {t.is_excluded ? "Include in spending" : "Exclude from spending"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
})
