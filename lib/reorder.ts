import type { Category, Entry } from "@/lib/types"

/** Move `draggedId` to `targetId`'s position; returns reindexed list + updates. */
export function reorderCategoryList(
  cats: Category[],
  draggedId: string,
  targetId: string,
): { categories: Category[]; updates: { id: string; sort_order: number }[] } {
  const arr = [...cats].sort((a, b) => a.sort_order - b.sort_order)
  const from = arr.findIndex((c) => c.id === draggedId)
  const to = arr.findIndex((c) => c.id === targetId)
  if (from < 0 || to < 0 || from === to) return { categories: cats, updates: [] }
  const [moved] = arr.splice(from, 1)
  arr.splice(to, 0, moved)
  const categories = arr.map((c, i) => ({ ...c, sort_order: i }))
  return {
    categories,
    updates: categories.map((c) => ({ id: c.id, sort_order: c.sort_order })),
  }
}

/**
 * Move an entry into `targetCategoryId`, before `beforeEntryId` (or to the end
 * when null). Returns the patched entries array and the rows to persist.
 */
export function moveEntry(
  entries: Entry[],
  draggedId: string,
  targetCategoryId: string | null,
  beforeEntryId: string | null,
): {
  entries: Entry[]
  updates: { id: string; category_id: string | null; sort_order: number }[]
} {
  const dragged = entries.find((e) => e.id === draggedId)
  if (!dragged) return { entries, updates: [] }

  const group = entries
    .filter((e) => e.id !== draggedId && e.category_id === targetCategoryId)
    .sort((a, b) => a.sort_order - b.sort_order)

  let idx = beforeEntryId
    ? group.findIndex((e) => e.id === beforeEntryId)
    : group.length
  if (idx < 0) idx = group.length
  group.splice(idx, 0, { ...dragged, category_id: targetCategoryId })

  const orderMap = new Map(group.map((e, i) => [e.id, i]))
  const patched = entries.map((e) => {
    if (e.id === draggedId)
      return { ...e, category_id: targetCategoryId, sort_order: orderMap.get(e.id)! }
    if (orderMap.has(e.id)) return { ...e, sort_order: orderMap.get(e.id)! }
    return e
  })
  const updates = group.map((e) => ({
    id: e.id,
    category_id: targetCategoryId,
    sort_order: orderMap.get(e.id)!,
  }))
  return { entries: patched, updates }
}
