// Tiny drag-and-drop helper for moving amounts: from a salary result chip onto
// a grid cell, or copying one grid cell's value onto another.

import type { DragEvent } from "react"

const MIME = "application/x-budget-amount"

export function setDragAmount(e: DragEvent, amount: number) {
  e.dataTransfer.setData(MIME, String(amount))
  // Some browsers require a text fallback for the drag to initiate.
  e.dataTransfer.setData("text/plain", String(Math.round(amount)))
  e.dataTransfer.effectAllowed = "copy"
}

export function getDragAmount(e: DragEvent): number | null {
  const raw = e.dataTransfer.getData(MIME) || e.dataTransfer.getData("text/plain")
  if (!raw) return null
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

export function hasDragAmount(e: DragEvent): boolean {
  return e.dataTransfer.types.includes(MIME)
}

// Reordering payloads (entry rows, category groups). Each carries an id.
export const REORDER_ENTRY = "application/x-budget-entry"
export const REORDER_CATEGORY = "application/x-budget-category"

export function setDragId(e: DragEvent, type: string, id: string) {
  e.dataTransfer.setData(type, id)
  e.dataTransfer.setData("text/plain", id)
  e.dataTransfer.effectAllowed = "move"
}

export function getDragId(e: DragEvent, type: string): string | null {
  return e.dataTransfer.getData(type) || null
}

export function hasType(e: DragEvent, type: string): boolean {
  return e.dataTransfer.types.includes(type)
}
