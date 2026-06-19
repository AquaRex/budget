"use client"

import { Fragment, useEffect, useRef, useState } from "react"
import { GripVertical, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"

import type { Category, Entry, EntryAmount, EntryKind } from "@/lib/types"
import { formatNOK, formatNumber, dayLabel } from "@/lib/format"
import { cn } from "@/lib/utils"
import {
  MONTHS_SHORT,
  hasOverride,
  isFilledEveryMonth,
  rowMonthlyAmounts,
  rowTotal,
  rowAverage,
  monthTotal,
  monthlySubtotals,
} from "@/lib/budget"
import {
  REORDER_ENTRY,
  REORDER_CATEGORY,
  setDragId,
  getDragId,
  hasType,
} from "@/lib/dnd"
import { reorderCategoryList, moveEntry } from "@/lib/reorder"
import {
  useEntries,
  useAmounts,
  useSalaryProfile,
  useCategories,
  useMethods,
  useBudgetContext,
} from "@/lib/data/use-budget"
import { deleteEntry, setAmount, reorderEntries } from "@/lib/data/entries"
import {
  reorderCategories,
  renameCategory,
  deleteCategory,
} from "@/lib/data/categories"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { EditableCell } from "@/components/entries/editable-cell"
import { EntryDialog } from "@/components/entries/entry-dialog"
import { SalaryCalculator } from "@/components/income/salary-calculator"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

const sticky = "sticky left-0 z-10"
const COLS = 18

type Confirm = { type: "entry" | "category"; id: string; name: string }

export function EntriesGrid({ kind }: { kind: EntryKind }) {
  const isBill = kind === "bill"

  const { entries, isLoading: le, mutate: mutateEntries } = useEntries(kind)
  const { amounts, isLoading: la, mutate: mutateAmounts } = useAmounts()
  const { profile, mutate: mutateSalary } = useSalaryProfile()
  const { categories, mutate: mutateCategories } = useCategories()
  const { methods } = useMethods()
  const ctx = useBudgetContext(amounts, profile)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Entry | null>(null)
  const [presetCategory, setPresetCategory] = useState("")
  const [confirm, setConfirm] = useState<Confirm | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState("")
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  const [hoverCol, setHoverCol] = useState<number | null>(null)

  // Float the header to the top of the page as the table scrolls past, without
  // turning the list into its own scroll box. (A horizontal-scroll wrapper can't
  // do viewport-sticky in pure CSS, so we offset the thead with JS instead.)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const theadRef = useRef<HTMLTableSectionElement>(null)
  const [headOffset, setHeadOffset] = useState(0)

  useEffect(() => {
    const APP_HEADER = 56 // sticky app header height (h-14)
    let raf = 0
    const update = () => {
      raf = 0
      const wrap = wrapperRef.current
      const thead = theadRef.current
      if (!wrap || !thead) return
      const rect = wrap.getBoundingClientRect()
      const max = Math.max(0, rect.height - thead.offsetHeight)
      const offset =
        rect.top < APP_HEADER ? Math.min(APP_HEADER - rect.top, max) : 0
      setHeadOffset((prev) => (prev === offset ? prev : offset))
    }
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update)
    }
    raf = requestAnimationFrame(update)
    window.addEventListener("scroll", onScroll, { passive: true })
    window.addEventListener("resize", onScroll)
    return () => {
      window.removeEventListener("scroll", onScroll)
      window.removeEventListener("resize", onScroll)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [])

  const loading = le || la
  const methodName = (id: string | null) =>
    methods.find((m) => m.id === id)?.name ?? ""
  // Weak column tint on hover; the hovered cell itself stays stronger.
  const colBg = (m: number) => (hoverCol === m ? "bg-primary/5" : "")

  function openAdd(category: string) {
    setEditing(null)
    setPresetCategory(category)
    setDialogOpen(true)
  }

  function refresh() {
    mutateEntries()
    mutateAmounts()
    mutateSalary()
    mutateCategories()
  }

  // Inline cell edit / drop: optimistic amounts cache update, then persist.
  function commitCell(entry: Entry, month: number, amount: number | null) {
    const next: EntryAmount[] = amounts.filter(
      (a) => !(a.entry_id === entry.id && a.month === month),
    )
    if (amount !== null) {
      next.push({
        id: `optimistic-${entry.id}-${month}`,
        user_id: entry.user_id,
        entry_id: entry.id,
        month,
        amount,
      })
    }
    mutateAmounts(next, { revalidate: false })
    setAmount(entry.id, month, amount)
      .then(() => mutateAmounts())
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : "Could not save.")
        mutateAmounts()
      })
  }

  function commitEntryMove(
    draggedId: string,
    targetCategoryId: string | null,
    beforeEntryId: string | null,
  ) {
    if (draggedId === beforeEntryId) return
    const { entries: nextEntries, updates } = moveEntry(
      entries,
      draggedId,
      targetCategoryId,
      beforeEntryId,
    )
    if (updates.length === 0) return
    mutateEntries(nextEntries, { revalidate: false })
    reorderEntries(updates)
      .then(() => mutateEntries())
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : "Could not reorder.")
        mutateEntries()
      })
  }

  function commitCategoryReorder(draggedId: string, targetId: string) {
    if (draggedId === targetId) return
    const { categories: nextCats, updates } = reorderCategoryList(
      categories,
      draggedId,
      targetId,
    )
    if (updates.length === 0) return
    mutateCategories(nextCats, { revalidate: false })
    reorderCategories(updates)
      .then(() => mutateCategories())
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : "Could not reorder.")
        mutateCategories()
      })
  }

  async function commitRename(id: string) {
    const name = renameDraft.trim()
    setRenamingId(null)
    if (!name) return
    try {
      await renameCategory(id, name)
      mutateCategories()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not rename.")
    }
  }

  async function confirmDelete() {
    if (!confirm) return
    setDeleting(true)
    try {
      if (confirm.type === "entry") {
        await deleteEntry(confirm.id)
        refresh()
      } else {
        await deleteCategory(confirm.id)
        mutateCategories()
        mutateEntries()
      }
      toast.success("Deleted.")
      setConfirm(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete.")
    } finally {
      setDeleting(false)
    }
  }

  const grandTotals = MONTHS_SHORT.map((_, i) => monthTotal(entries, ctx, i + 1))
  const grandTotal = grandTotals.reduce((s, v) => s + v, 0)

  const itemsOf = (catId: string | null) =>
    entries
      .filter((e) => e.category_id === catId)
      .sort((a, b) => a.sort_order - b.sort_order)
  const uncategorized = itemsOf(null)
  // Categories are a shared pool now; only show bands that hold entries here.
  const visibleCats = categories.filter((c) => itemsOf(c.id).length > 0)

  function renderEntryRow(entry: Entry) {
    const values = rowMonthlyAmounts(entry, ctx)
    const total = rowTotal(values)
    const avg = rowAverage(entry, ctx, values)
    const filled = isFilledEveryMonth(entry)
    const isDropBefore = dropTarget === `entry:${entry.id}`
    return (
      <tr
        key={entry.id}
        className={cn("border-b last:border-0", !entry.is_active && "opacity-50")}
      >
        <td
          className={cn(
            sticky,
            "bg-background px-2 py-1.5",
            isDropBefore && "border-primary border-t-2",
          )}
          onDragOver={(e) => {
            if (!hasType(e, REORDER_ENTRY)) return
            e.preventDefault()
            setDropTarget(`entry:${entry.id}`)
          }}
          onDragLeave={() => setDropTarget(null)}
          onDrop={(e) => {
            setDropTarget(null)
            const id = getDragId(e, REORDER_ENTRY)
            if (id) commitEntryMove(id, entry.category_id, entry.id)
          }}
        >
          <div className="flex items-center gap-1.5">
            <span
              draggable
              onDragStart={(e) => setDragId(e, REORDER_ENTRY, entry.id)}
              className="text-muted-foreground/50 hover:text-foreground cursor-grab active:cursor-grabbing"
              aria-label="Drag to reorder"
            >
              <GripVertical className="size-4" />
            </span>
            <span className="font-medium whitespace-nowrap">{entry.name}</span>
            {entry.is_salary ? (
              <Badge variant="secondary" className="text-[10px]">
                salary
              </Badge>
            ) : (
              !entry.is_recurring && (
                <Badge variant="outline" className="text-[10px]">
                  one-time
                </Badge>
              )
            )}
          </div>
        </td>
        <td className="text-muted-foreground px-2 py-1.5 whitespace-nowrap">
          {methodName(entry.method_id)}
        </td>
        <td className="text-muted-foreground px-2 py-1.5 whitespace-nowrap">
          {dayLabel(entry.due_day)}
        </td>
        {values.map((v, i) => (
          <td
            key={i}
            onMouseEnter={() => setHoverCol(i + 1)}
            className={cn("px-0.5 py-1", colBg(i + 1))}
          >
            <EditableCell
              value={v}
              isOverride={hasOverride(ctx.amounts, entry.id, i + 1)}
              isDefault={filled}
              disabled={!entry.is_active}
              onCommit={(amount) => commitCell(entry, i + 1, amount)}
            />
          </td>
        ))}
        <td className="px-2 py-1.5 text-right font-semibold tabular-nums whitespace-nowrap">
          {formatNumber(total)}
        </td>
        <td className="text-muted-foreground px-2 py-1.5 text-right tabular-nums whitespace-nowrap">
          {formatNumber(avg)}
        </td>
        <td className="px-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Actions">
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => {
                  setEditing(entry)
                  setDialogOpen(true)
                }}
              >
                <Pencil className="size-4" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                onClick={() =>
                  setConfirm({ type: "entry", id: entry.id, name: entry.name })
                }
              >
                <Trash2 className="size-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </td>
      </tr>
    )
  }

  function renderBand(cat: Category | null, items: Entry[]) {
    const subtotals = monthlySubtotals(items, ctx)
    const annual = subtotals.reduce((s, v) => s + v, 0)
    const key = cat ? cat.id : "uncategorized"
    const isOver = dropTarget === `cat:${key}`
    return (
      <tr
        className={cn(
          "bg-muted/60 border-y",
          isOver && "ring-primary ring-2 ring-inset",
        )}
      >
        <td
          className={cn(sticky, "bg-muted/60 px-2 py-2")}
          onDragOver={(e) => {
            if (!hasType(e, REORDER_ENTRY) && !hasType(e, REORDER_CATEGORY))
              return
            e.preventDefault()
            setDropTarget(`cat:${key}`)
          }}
          onDragLeave={() => setDropTarget(null)}
          onDrop={(e) => {
            setDropTarget(null)
            const entryId = getDragId(e, REORDER_ENTRY)
            if (entryId) {
              commitEntryMove(entryId, cat ? cat.id : null, null)
              return
            }
            const catId = getDragId(e, REORDER_CATEGORY)
            if (catId && cat) commitCategoryReorder(catId, cat.id)
          }}
        >
          <div className="flex items-center gap-1.5">
            {cat && (
              <span
                draggable
                onDragStart={(e) => setDragId(e, REORDER_CATEGORY, cat.id)}
                className="text-muted-foreground/60 hover:text-foreground cursor-grab active:cursor-grabbing"
                aria-label="Drag to reorder category"
              >
                <GripVertical className="size-4" />
              </span>
            )}
            {cat && renamingId === cat.id ? (
              <Input
                autoFocus
                value={renameDraft}
                onChange={(e) => setRenameDraft(e.target.value)}
                onBlur={() => commitRename(cat.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitRename(cat.id)
                  else if (e.key === "Escape") setRenamingId(null)
                }}
                className="h-7 w-40"
              />
            ) : (
              <span className="font-semibold whitespace-nowrap">
                {cat ? cat.name : "Uncategorized"}
              </span>
            )}
            {cat && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-6"
                    aria-label="Category actions"
                  >
                    <MoreHorizontal className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuItem
                    onClick={() => {
                      setRenamingId(cat.id)
                      setRenameDraft(cat.name)
                    }}
                  >
                    <Pencil className="size-4" />
                    Rename
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() =>
                      setConfirm({
                        type: "category",
                        id: cat.id,
                        name: cat.name,
                      })
                    }
                  >
                    <Trash2 className="size-4" />
                    Delete group
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </td>
        <td className="text-muted-foreground px-2 py-2 text-xs" colSpan={2}>
          Monthly totals
        </td>
        {subtotals.map((t, i) => (
          <td
            key={i}
            onMouseEnter={() => setHoverCol(i + 1)}
            className={cn(
              "px-1 py-2 text-right font-medium tabular-nums whitespace-nowrap",
              colBg(i + 1),
            )}
          >
            {t ? formatNumber(t) : ""}
          </td>
        ))}
        <td className="px-2 py-2 text-right font-semibold tabular-nums whitespace-nowrap">
          {formatNumber(annual)}
        </td>
        <td className="px-2 py-1.5 text-right" colSpan={2}>
          <Button
            size="sm"
            className="h-7 gap-1 px-2.5"
            onClick={() => openAdd(cat ? cat.name : "")}
          >
            <Plus className="size-3.5" />
            Add
          </Button>
        </td>
      </tr>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {isBill ? "Bills" : "Income"}
          </h1>
          <p className="text-muted-foreground text-sm">
            {isBill
              ? "Recurring monthly template — grouped, reorderable, with one-time months."
              : "Salary, feriepenger and any other income."}
          </p>
        </div>
        <Button onClick={() => openAdd("")}>
          <Plus className="size-4" />
          Add
        </Button>
      </div>

      {!isBill && <SalaryCalculator onChanged={refresh} />}

      <div ref={wrapperRef} className="overflow-x-auto rounded-lg border">
        <table
          className="w-full border-collapse text-sm"
          onMouseLeave={() => setHoverCol(null)}
        >
          <thead
            ref={theadRef}
            className="relative z-[11]"
            style={{ top: headOffset || undefined }}
          >
            <tr className="bg-muted border-b">
              <th className={cn(sticky, "bg-muted px-3 py-2 text-left font-medium")}>
                Name
              </th>
              <th className="text-muted-foreground px-2 py-2 text-left font-medium">
                Method
              </th>
              <th className="text-muted-foreground px-2 py-2 text-left font-medium">
                Day
              </th>
              {MONTHS_SHORT.map((m, i) => (
                <th
                  key={m}
                  onMouseEnter={() => setHoverCol(i + 1)}
                  className={cn(
                    "text-muted-foreground px-1 py-2 text-right font-medium",
                    colBg(i + 1),
                  )}
                >
                  {m}
                </th>
              ))}
              <th className="px-2 py-2 text-right font-semibold">Total</th>
              <th className="text-muted-foreground px-2 py-2 text-right font-medium">
                Avg
              </th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={COLS} className="p-3">
                  <Skeleton className="h-8 w-full" />
                </td>
              </tr>
            ) : entries.length === 0 ? (
              <tr>
                <td colSpan={COLS} className="text-muted-foreground py-10 text-center">
                  No {isBill ? "bills" : "income"} yet.
                  {isBill
                    ? " Click “Add” to start."
                    : " Set up the salary calculator above, or click “Add”."}
                </td>
              </tr>
            ) : visibleCats.length === 0 ? (
              uncategorized.map((e) => renderEntryRow(e))
            ) : (
              <>
                {visibleCats.map((cat, idx) => (
                  <Fragment key={cat.id}>
                    {idx > 0 && (
                      <tr aria-hidden>
                        <td colSpan={COLS} className="bg-background h-12 border-0 p-0" />
                      </tr>
                    )}
                    {renderBand(cat, itemsOf(cat.id))}
                    {itemsOf(cat.id).map((e) => renderEntryRow(e))}
                  </Fragment>
                ))}
                {uncategorized.length > 0 && (
                  <>
                    <tr aria-hidden>
                      <td colSpan={COLS} className="bg-background h-12 border-0 p-0" />
                    </tr>
                    {renderBand(null, uncategorized)}
                    {uncategorized.map((e) => renderEntryRow(e))}
                  </>
                )}
              </>
            )}
          </tbody>
          {entries.length > 0 && (
            <tfoot>
              <tr className="bg-muted border-t-2 font-semibold">
                <td className={cn(sticky, "bg-muted px-3 py-2")}>Grand total</td>
                <td colSpan={2} />
                {grandTotals.map((t, i) => (
                  <td
                    key={i}
                    onMouseEnter={() => setHoverCol(i + 1)}
                    className={cn(
                      "px-1 py-2 text-right tabular-nums whitespace-nowrap",
                      colBg(i + 1),
                    )}
                  >
                    {formatNumber(t)}
                  </td>
                ))}
                <td className="px-2 py-2 text-right tabular-nums whitespace-nowrap">
                  {formatNumber(grandTotal)}
                </td>
                <td />
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <p className="text-muted-foreground text-xs">
        Drag the ⋮⋮ handle to reorder rows or whole categories (drop a row on a
        category band to move it there). Click a month cell to type, or drag a
        cell / salary result onto another. Annual total:{" "}
        <span className="text-foreground font-medium">{formatNOK(grandTotal)}</span>
        .
      </p>

      <EntryDialog
        kind={kind}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        entry={editing}
        presetCategory={presetCategory}
        onSaved={refresh}
      />

      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{confirm?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.type === "category"
                ? "The group is removed; its entries become uncategorized (not deleted)."
                : "This removes the entry and all its monthly amounts. You can’t undo this."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                confirmDelete()
              }}
              disabled={deleting}
            >
              {deleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
