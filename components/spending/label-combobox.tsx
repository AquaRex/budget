"use client"

import { useEffect, useRef, useState } from "react"
import { Check, Plus, Tag, X } from "lucide-react"

import type { Label } from "@/lib/types"
import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"

/**
 * A small label picker: search existing labels, create a new one inline, or
 * clear the current label. Built as a self-contained popover (no menu keyboard
 * quirks fighting the search box). `onPick` receives the chosen label id, or
 * null to clear. `onCreate` makes a new label and returns its id.
 */
export function LabelCombobox({
  labels,
  value,
  onPick,
  onCreate,
  trigger,
  align = "start",
}: {
  labels: Label[]
  value?: string | null
  onPick: (labelId: string | null) => void | Promise<void>
  onCreate: (name: string) => Promise<string>
  trigger: React.ReactNode
  align?: "start" | "end"
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState("")
  const [busy, setBusy] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false)
    document.addEventListener("mousedown", onDoc)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onDoc)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  const query = q.trim()
  const filtered = labels
    .filter((l) => l.name.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name))
  const canCreate =
    query.length > 0 &&
    !labels.some((l) => l.name.toLowerCase() === query.toLowerCase())

  async function run(fn: () => Promise<void> | void) {
    setBusy(true)
    try {
      await fn()
      setOpen(false)
      setQ("")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center"
      >
        {trigger}
      </button>
      {open && (
        <div
          className={cn(
            "bg-popover absolute z-50 mt-1 w-56 overflow-hidden rounded-md border shadow-md",
            align === "end" ? "right-0" : "left-0",
          )}
        >
          <div className="p-1.5">
            <Input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && canCreate)
                  run(async () => onPick(await onCreate(query)))
              }}
              placeholder="Find or create label…"
              className="h-8 text-xs"
            />
          </div>
          <div className="max-h-56 overflow-y-auto px-1 pb-1">
            {value != null && (
              <button
                type="button"
                disabled={busy}
                onClick={() => run(() => onPick(null))}
                className="text-muted-foreground hover:bg-accent flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs"
              >
                <X className="size-3.5" />
                Clear label
              </button>
            )}
            {filtered.map((l) => (
              <button
                key={l.id}
                type="button"
                disabled={busy}
                onClick={() => run(() => onPick(l.id))}
                className="hover:bg-accent flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs"
              >
                <Tag className="size-3.5 shrink-0 opacity-70" />
                <span className="truncate">{l.name}</span>
                {value === l.id && <Check className="ml-auto size-3.5" />}
              </button>
            ))}
            {canCreate && (
              <button
                type="button"
                disabled={busy}
                onClick={() => run(async () => onPick(await onCreate(query)))}
                className="hover:bg-accent flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs"
              >
                <Plus className="size-3.5 shrink-0" />
                Create &ldquo;<span className="truncate">{query}</span>&rdquo;
              </button>
            )}
            {filtered.length === 0 && !canCreate && (
              <div className="text-muted-foreground px-2 py-1.5 text-xs">
                No labels yet.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
