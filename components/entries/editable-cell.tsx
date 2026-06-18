"use client"

import { useRef, useState } from "react"

import { cn } from "@/lib/utils"
import { formatNumber } from "@/lib/format"
import { setDragAmount, getDragAmount, hasDragAmount } from "@/lib/dnd"

type Props = {
  value: number
  /** True when this month has an explicit value (override / one-time entry). */
  isOverride: boolean
  /** True when the value comes from a computed/recurring default (shown muted). */
  isDefault: boolean
  disabled?: boolean
  /** Commit a new amount, or null to clear the override. */
  onCommit: (amount: number | null) => void
}

// Parse a user-typed amount: allow "12 000", "12.000", "12000,5", "" (clear).
function parseAmount(raw: string): number | null {
  const trimmed = raw.trim().replace(/\s/g, "").replace(",", ".")
  if (trimmed === "") return null
  const n = Number(trimmed)
  if (!Number.isFinite(n) || n < 0) return null
  return n
}

export function EditableCell({
  value,
  isOverride,
  isDefault,
  disabled,
  onCommit,
}: Props) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState("")
  const [dragOver, setDragOver] = useState(false)
  const committedRef = useRef(false)

  function startEdit() {
    if (disabled) return
    setDraft(value ? String(value) : "")
    committedRef.current = false
    setEditing(true)
  }

  function commit() {
    if (committedRef.current) return
    committedRef.current = true
    setEditing(false)
    const parsed = parseAmount(draft)
    if (parsed === null || parsed === 0) {
      if (isOverride) onCommit(null)
      return
    }
    if (parsed !== value) onCommit(parsed)
  }

  function cancel() {
    committedRef.current = true
    setEditing(false)
  }

  if (editing) {
    return (
      <input
        type="text"
        inputMode="decimal"
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit()
          else if (e.key === "Escape") cancel()
        }}
        onFocus={(e) => e.currentTarget.select()}
        className="border-primary bg-background h-8 w-full min-w-16 rounded-sm border px-1 text-right text-sm tabular-nums outline-none"
      />
    )
  }

  const empty = value === 0 && !isOverride
  return (
    <button
      type="button"
      onClick={startEdit}
      disabled={disabled}
      draggable={!disabled && value > 0}
      onDragStart={(e) => setDragAmount(e, value)}
      onDragOver={(e) => {
        if (disabled || !hasDragAmount(e)) return
        e.preventDefault()
        e.dataTransfer.dropEffect = "copy"
        if (!dragOver) setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        setDragOver(false)
        if (disabled) return
        const amount = getDragAmount(e)
        if (amount === null) return
        e.preventDefault()
        onCommit(amount > 0 ? amount : null)
      }}
      className={cn(
        "h-8 w-full min-w-16 cursor-grab rounded-sm px-1 text-right text-sm tabular-nums active:cursor-grabbing",
        "hover:bg-muted focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
        empty && "text-muted-foreground/40",
        isDefault && !isOverride && "text-muted-foreground",
        isOverride && "text-foreground font-medium",
        dragOver && "ring-primary bg-primary/10 ring-2",
      )}
    >
      {empty ? "–" : formatNumber(value)}
    </button>
  )
}
