"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  FolderPlus,
  GripVertical,
  MoreHorizontal,
  Plus,
} from "lucide-react"
import { toast } from "sonner"

import type { Category } from "@/lib/types"
import { annualTotal } from "@/lib/budget"
import { formatNOK } from "@/lib/format"
import { cn } from "@/lib/utils"
import { useYear } from "@/lib/year"
import { buildTypeMap, effectiveCategoryId, effectiveDate } from "@/lib/spending"
import {
  useAmounts,
  useBudgetContext,
  useCategories,
  useEntries,
  useEntryCounts,
  useSalaryProfile,
  useTransactions,
  useTxRules,
  useTypeCategories,
} from "@/lib/data/use-budget"
import {
  createCategory,
  createGroup,
  renameCategory,
  reorderCategories,
  setCategoryIsGroup,
  setCategorySavings,
} from "@/lib/data/categories"
import { setCategoryGroup } from "@/lib/data/groups"
import { REORDER_CATEGORY, getDragId, hasType, setDragId } from "@/lib/dnd"
import { reorderCategoryList } from "@/lib/reorder"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { CategorySelect } from "@/components/spending/category-picker"
import {
  DeleteCategoryDialog,
  MergeDialog,
  budgetRowsLabel,
  plural,
  yearSpan,
  type CategoryUsage,
} from "@/components/settings/category-dialogs"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

const MOVE_CATEGORY = "application/x-budget-move-category"

type Stat = CategoryUsage & { spent: number; budget: number }
const EMPTY: Stat = {
  transactions: 0,
  rules: 0,
  mappings: 0,
  entries: 0,
  entryYears: "",
  members: 0,
  spent: 0,
  budget: 0,
}

/** Groups → their categories, with this year's money and what uses each one. */
export function CategoryTree() {
  const router = useRouter()
  const year = useYear()
  const { categories, mutate: mutateCats } = useCategories()
  const { transactions, mutate: mutateTx } = useTransactions()
  const { rules, mutate: mutateRules } = useTxRules()
  const { typeCategories, mutate: mutateTypes } = useTypeCategories()
  const { entries: bills, mutate: mutateBills } = useEntries("bill")
  const { entries: incomes, mutate: mutateIncomes } = useEntries("income")
  // Budget rows in every year: moves and deletes touch all of them.
  const { counts: entryCounts, mutate: mutateEntryCounts } = useEntryCounts()
  const { amounts } = useAmounts()
  const { profile } = useSalaryProfile()
  const ctx = useBudgetContext(amounts, profile)
  const typeMap = useMemo(() => buildTypeMap(typeCategories), [typeCategories])

  const [renaming, setRenaming] = useState<string | null>(null)
  const [draft, setDraft] = useState("")
  const [adding, setAdding] = useState<string | null>(null) // group id, or "group"
  const [newName, setNewName] = useState("")
  const [moving, setMoving] = useState<string | null>(null)
  const [dropOn, setDropOn] = useState<string | null>(null)
  const [merge, setMerge] = useState<Category | null>(null)
  const [remove, setRemove] = useState<Category | null>(null)
  const [ungroup, setUngroup] = useState<Category | null>(null)
  const [ungroupTo, setUngroupTo] = useState<string | null>(null)

  const refresh = () => {
    mutateCats()
    mutateTx()
    mutateRules()
    mutateTypes()
    mutateBills()
    mutateIncomes()
    mutateEntryCounts()
  }

  async function act(fn: () => Promise<unknown>, err: string) {
    try {
      await fn()
      refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : err)
    }
  }

  const groups = useMemo(
    () =>
      categories
        .filter((c) => c.is_group)
        .sort((a, b) => a.sort_order - b.sort_order),
    [categories],
  )
  const groupIds = useMemo(() => new Set(groups.map((g) => g.id)), [groups])
  const membersOf = (groupId: string) =>
    categories
      .filter((c) => !c.is_group && c.group_id === groupId)
      .sort((a, b) => a.name.localeCompare(b.name))
  const needsSorting = categories
    .filter((c) => !c.is_group && (!c.group_id || !groupIds.has(c.group_id)))
    .sort((a, b) => a.name.localeCompare(b.name))

  const stats = useMemo(() => {
    const m = new Map<string, Stat>()
    const get = (id: string) => {
      let s = m.get(id)
      if (!s) {
        s = { ...EMPTY }
        m.set(id, s)
      }
      return s
    }
    const yearKey = String(year)
    for (const t of transactions) {
      const id = effectiveCategoryId(t, typeMap)
      if (!id) {
        continue
      }
      const s = get(id)
      s.transactions++
      if (!t.is_excluded && effectiveDate(t).startsWith(yearKey)) {
        s.spent -= Number(t.amount)
      }
    }
    for (const r of rules) {
      if (r.category_id) {
        get(r.category_id).rules++
      }
    }
    for (const tc of typeCategories) {
      get(tc.category_id).mappings++
    }
    for (const c of categories) {
      if (c.is_group) {
        const own = [...bills, ...incomes].filter((e) => e.category_id === c.id)
        const s = get(c.id)
        const counted = entryCounts.get(c.id)
        s.entries = counted?.total ?? 0
        s.entryYears = yearSpan(counted?.byYear)
        s.budget =
          annualTotal(own.filter((e) => e.kind === "bill"), ctx) -
          annualTotal(own.filter((e) => e.kind === "income"), ctx)
      } else if (c.group_id) {
        get(c.group_id).members++
      }
    }
    return m
  }, [transactions, typeMap, rules, typeCategories, categories, bills, incomes, ctx, year, entryCounts])
  const stat = (id: string) => stats.get(id) ?? EMPTY
  const groupSpent = (g: Category) =>
    membersOf(g.id).reduce((s, c) => s + stat(c.id).spent, stat(g.id).spent)

  // A group lists everything placed in it; a category only its own rows.
  const viewCategory = (c: Category) =>
    router.push(
      `/transactions?tab=transactions&period=all&${c.is_group ? "group" : "cat"}=${c.id}`,
    )

  async function commitRename(c: Category) {
    const name = draft.trim()
    setRenaming(null)
    if (name && name !== c.name) {
      await act(() => renameCategory(c.id, name), "Could not rename.")
    }
  }

  async function commitAdd() {
    const name = newName.trim()
    const where = adding
    setAdding(null)
    setNewName("")
    if (!name || !where) {
      return
    }
    await act(
      () => (where === "group" ? createGroup(name) : createCategory(name, where)),
      "Could not create.",
    )
  }

  function moveTo(categoryId: string, groupId: string | null) {
    setMoving(null)
    act(() => setCategoryGroup(categoryId, groupId), "Could not move.")
  }

  // A group becoming a category takes its categories' new home with it.
  function closeUngroup() {
    setUngroup(null)
    setUngroupTo(null)
  }
  async function confirmUngroup() {
    const g = ungroup
    const dest = ungroupTo
    closeUngroup()
    if (!g) {
      return
    }
    await act(async () => {
      for (const m of membersOf(g.id)) {
        await setCategoryGroup(m.id, dest)
      }
      await setCategoryIsGroup(g.id, false)
      await setCategoryGroup(g.id, dest)
    }, "Could not turn it into a category.")
  }

  function reorderGroups(draggedId: string, targetId: string) {
    const { updates } = reorderCategoryList(groups, draggedId, targetId)
    if (updates.length > 0) {
      act(() => reorderCategories(updates), "Could not reorder.")
    }
  }

  const money = (v: number) =>
    v < 0 ? (
      <span className="text-emerald-600 dark:text-emerald-400">+{formatNOK(-v)}</span>
    ) : (
      formatNOK(v)
    )

  const nameCell = (c: Category, className?: string) =>
    renaming === c.id ? (
      <Input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => commitRename(c)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            commitRename(c)
          } else if (e.key === "Escape") {
            setRenaming(null)
          }
        }}
        className="h-7 w-48 text-sm"
      />
    ) : (
      <button
        type="button"
        onClick={() => viewCategory(c)}
        title="Show its transactions"
        className={cn("hover:text-primary truncate text-left hover:underline", className)}
      >
        {c.name}
      </button>
    )

  const menu = (c: Category) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`${c.name} actions`}>
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onSelect={() => {
            setRenaming(c.id)
            setDraft(c.name)
          }}
        >
          Rename
        </DropdownMenuItem>
        {c.is_group ? (
          <DropdownMenuItem onSelect={() => setAdding(c.id)}>
            Add a category
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem onSelect={() => setMoving(c.id)}>
            Move to group…
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={() => setMerge(c)}>Merge into…</DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() =>
            c.is_group
              ? setUngroup(c)
              : act(() => setCategoryIsGroup(c.id, true), "Could not make it a group.")
          }
        >
          {c.is_group ? "Turn into a category" : "Make it a group"}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={() => setRemove(c)}>
          Delete…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )

  const isUnused = (c: Category) => {
    const s = stat(c.id)
    return c.is_group
      ? s.transactions + s.entries + s.members + s.rules + s.mappings === 0
      : s.transactions + s.rules + s.mappings === 0
  }

  // Only the handle is draggable: a draggable row swallows clicks on its selects.
  const dragHandle = (c: Category) => (
    <span
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(MOVE_CATEGORY, c.id)
        e.dataTransfer.effectAllowed = "move"
        if (e.currentTarget.parentElement) {
          e.dataTransfer.setDragImage(e.currentTarget.parentElement, 0, 0)
        }
      }}
      className="text-muted-foreground/50 hover:text-foreground shrink-0 cursor-grab"
      aria-label="Drag onto a group to move it"
    >
      <GripVertical className="size-4" />
    </span>
  )

  const categoryRow = (c: Category) => {
    const s = stat(c.id)
    return (
      <div
        key={c.id}
        className="hover:bg-muted/50 flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5 pr-1 pl-2"
      >
        {dragHandle(c)}
        <div className="flex min-w-[10rem] flex-1 items-center gap-2 text-sm">
          {nameCell(c)}
          {isUnused(c) && (
            <span className="text-muted-foreground border px-1 text-[10px] tracking-wide uppercase">
              unused
            </span>
          )}
        </div>
        {moving === c.id ? (
          <div className="w-56">
            <CategorySelect
              categories={categories}
              value={c.group_id}
              onChange={(g) => moveTo(c.id, g)}
              groupsOnly
              noneLabel="Needs sorting (no group)"
            />
          </div>
        ) : (
          <span className="text-muted-foreground text-xs tabular-nums">
            {s.transactions} tx · {s.rules} rule{s.rules === 1 ? "" : "s"}
          </span>
        )}
        <span className="ml-auto w-28 text-right text-xs tabular-nums">{money(s.spent)}</span>
        {menu(c)}
      </div>
    )
  }

  const addInput = (where: string, placeholder: string) =>
    adding === where && (
      <div className="flex items-center gap-2 py-1.5 pl-8">
        <Input
          autoFocus
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onBlur={commitAdd}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              commitAdd()
            } else if (e.key === "Escape") {
              setAdding(null)
              setNewName("")
            }
          }}
          placeholder={placeholder}
          className="h-8 max-w-xs text-sm"
        />
      </div>
    )

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted-foreground text-xs">
          Spend is {year} · drag a category onto a group to move it, or a group&apos;s
          handle onto another group to reorder.
        </p>
        <Button size="sm" variant="outline" onClick={() => setAdding("group")}>
          <FolderPlus className="size-4" />
          New group
        </Button>
      </div>
      {addInput("group", "New group, e.g. Hobbies")}

      <div className="grid gap-3 xl:grid-cols-2">
        {groups.map((g) => {
          const s = stat(g.id)
          const members = membersOf(g.id)
          return (
            <div
              key={g.id}
              onDragOver={(e) => {
                if (hasType(e, MOVE_CATEGORY) || hasType(e, REORDER_CATEGORY)) {
                  e.preventDefault()
                  setDropOn(g.id)
                }
              }}
              onDragLeave={() => setDropOn((d) => (d === g.id ? null : d))}
              onDrop={(e) => {
                setDropOn(null)
                const moved = e.dataTransfer.getData(MOVE_CATEGORY)
                if (moved) {
                  moveTo(moved, g.id)
                  return
                }
                const dragged = getDragId(e, REORDER_CATEGORY)
                if (dragged && dragged !== g.id) {
                  reorderGroups(dragged, g.id)
                }
              }}
              className={cn(
                "flex flex-col border",
                g.is_savings && "border-emerald-500/40",
                dropOn === g.id && "ring-primary ring-2",
              )}
            >
              <div
                className={cn(
                  "bg-muted/60 flex flex-wrap items-center gap-x-3 gap-y-1 border-b py-2 pr-1 pl-2",
                  g.is_savings && "bg-emerald-500/10",
                )}
              >
                <span
                  draggable
                  onDragStart={(e) => setDragId(e, REORDER_CATEGORY, g.id)}
                  className="text-muted-foreground/60 hover:text-foreground cursor-grab"
                  aria-label="Drag to reorder groups"
                >
                  <GripVertical className="size-4" />
                </span>
                <div className="flex min-w-0 flex-1 items-center gap-2 font-semibold">
                  {nameCell(g)}
                  {isUnused(g) && (
                    <span className="text-muted-foreground border px-1 text-[10px] font-normal tracking-wide uppercase">
                      unused
                    </span>
                  )}
                </div>
                <label className="text-muted-foreground flex cursor-pointer items-center gap-1.5 text-xs">
                  Savings
                  <Switch
                    checked={g.is_savings}
                    onCheckedChange={(v) =>
                      act(() => setCategorySavings(g.id, v), "Could not update group.")
                    }
                  />
                </label>
                {menu(g)}
                <div className="text-muted-foreground flex w-full justify-between gap-3 pl-6 text-xs tabular-nums">
                  <span>
                    Budget {year} {money(s.budget)} · {budgetRowsLabel(s)}
                  </span>
                  <span>
                    {g.is_savings ? "Saved" : groupSpent(g) < 0 ? "Received" : "Spent"}{" "}
                    {money(groupSpent(g))}
                  </span>
                </div>
              </div>
              <div className="flex flex-col divide-y">
                {members.map(categoryRow)}
                {s.transactions > 0 && (
                  <p className="text-muted-foreground py-1.5 pl-8 text-xs">
                    + {s.transactions} transaction{s.transactions === 1 ? "" : "s"} placed on{" "}
                    {g.name} itself
                  </p>
                )}
                {addInput(g.id, `New category in ${g.name}`)}
                {adding !== g.id && (
                  <button
                    type="button"
                    onClick={() => setAdding(g.id)}
                    className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 py-1.5 pl-8 text-left text-xs"
                  >
                    <Plus className="size-3.5" />
                    Add category
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <div
        onDragOver={(e) => {
          if (hasType(e, MOVE_CATEGORY)) {
            e.preventDefault()
            setDropOn("none")
          }
        }}
        onDragLeave={() => setDropOn((d) => (d === "none" ? null : d))}
        onDrop={(e) => {
          setDropOn(null)
          const moved = e.dataTransfer.getData(MOVE_CATEGORY)
          if (moved) {
            moveTo(moved, null)
          }
        }}
        className={cn(
          "flex flex-col border border-amber-500/40",
          dropOn === "none" && "ring-primary ring-2",
        )}
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b bg-amber-500/5 px-3 py-2">
          <span className="text-sm font-semibold">
            Needs sorting
            <span className="text-muted-foreground ml-2 text-xs font-normal">
              categories in no group don&apos;t count in Groups
            </span>
          </span>
          <Link
            href="/transactions?tab=transactions&period=all&needs=1"
            className="text-muted-foreground hover:text-foreground text-xs underline-offset-2 hover:underline"
          >
            Uncategorised transactions →
          </Link>
        </div>
        {needsSorting.length === 0 ? (
          <p className="text-muted-foreground px-3 py-3 text-sm">
            Every category is in a group.
          </p>
        ) : (
          <div className="flex flex-col divide-y">
            {needsSorting.map((c) => (
              <div
                key={c.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5 pr-1 pl-2"
              >
                {dragHandle(c)}
                <div className="flex min-w-[10rem] flex-1 items-center gap-2 text-sm">
                  {nameCell(c)}
                  {isUnused(c) && (
                    <span className="text-muted-foreground border px-1 text-[10px] tracking-wide uppercase">
                      unused
                    </span>
                  )}
                  <span className="text-muted-foreground text-xs tabular-nums">
                    {stat(c.id).transactions} tx
                  </span>
                </div>
                <div className="w-48">
                  <CategorySelect
                    categories={categories}
                    value={null}
                    onChange={(g) => g && moveTo(c.id, g)}
                    groupsOnly
                    placeholder="Move to group…"
                  />
                </div>
                {menu(c)}
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog open={!!ungroup} onOpenChange={(o) => !o && closeUngroup()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Turn {ungroup?.name} into a category</DialogTitle>
            <DialogDescription>
              {ungroup?.name} and its{" "}
              {plural(ungroup ? membersOf(ungroup.id).length : 0, "category")} move into
              the group you pick.
            </DialogDescription>
          </DialogHeader>
          {ungroup && stat(ungroup.id).entries > 0 ? (
            <p className="text-sm">
              It still has {budgetRowsLabel(stat(ungroup.id))}. Move them to another
              group on the Budget page first (budget rows can only use groups).
            </p>
          ) : (
            <CategorySelect
              categories={categories}
              value={ungroupTo}
              onChange={setUngroupTo}
              groupsOnly
              exclude={ungroup ? [ungroup.id] : []}
              noneLabel="Needs sorting (no group)"
            />
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={closeUngroup}>
              Cancel
            </Button>
            <Button
              onClick={confirmUngroup}
              disabled={!ungroup || stat(ungroup.id).entries > 0}
            >
              Turn into a category
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <MergeDialog
        source={merge}
        categories={categories}
        onClose={() => setMerge(null)}
        onDone={refresh}
      />
      <DeleteCategoryDialog
        target={remove}
        categories={categories}
        onClose={() => setRemove(null)}
        onDone={refresh}
      />
    </div>
  )
}
