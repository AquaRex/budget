"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { Check, Settings2, X } from "lucide-react"

import type { Category } from "@/lib/types"
import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export type CategoryOption = { id: string; group: string | null; name: string }
type Option = CategoryOption

const NO_GROUP = "No group"

/** Every category as "Group › Category", groups first in their own order. */
export function categoryOptions(categories: Category[]): Option[] {
  const groups = categories
    .filter((c) => c.is_group)
    .sort((a, b) => a.sort_order - b.sort_order)
  const groupIds = new Set(groups.map((g) => g.id))
  const byName = (a: Category, b: Category) => a.name.localeCompare(b.name)
  const out: Option[] = []
  for (const g of groups) {
    out.push({ id: g.id, group: null, name: g.name })
    for (const c of categories
      .filter((c) => c.group_id === g.id && !c.is_group)
      .sort(byName)) {
      out.push({ id: c.id, group: g.name, name: c.name })
    }
  }
  for (const c of categories
    .filter((c) => !c.is_group && (!c.group_id || !groupIds.has(c.group_id)))
    .sort(byName)) {
    out.push({ id: c.id, group: NO_GROUP, name: c.name })
  }
  return out
}

/** "Food › Dagligvarer", or just the name for a group or a loose category. */
export function optionLabel(o: Option): string {
  return o.group && o.group !== NO_GROUP ? `${o.group} › ${o.name}` : o.name
}

/**
 * A select-only grouped category picker. `groupsOnly` limits it to groups (for
 * budget entries and group moves); `exclude` hides ids (e.g. a merge source).
 */
export function CategorySelect({
  categories,
  value,
  onChange,
  noneLabel,
  groupsOnly = false,
  exclude,
  className,
  disabled,
  placeholder = "Choose…",
}: {
  categories: Category[]
  value: string | null
  onChange: (id: string | null) => void
  /** Offer a "no category" choice with this wording. */
  noneLabel?: string
  groupsOnly?: boolean
  exclude?: string[]
  className?: string
  disabled?: boolean
  placeholder?: string
}) {
  const options = categoryOptions(categories).filter(
    (o) => (!groupsOnly || o.group === null) && !exclude?.includes(o.id),
  )
  // An empty Radix list opens off-screen, so say so on the trigger instead.
  const empty = options.length === 0 && !noneLabel
  return (
    <Select
      value={value ?? (noneLabel ? NONE : "")}
      onValueChange={(v) => onChange(v === NONE ? null : v)}
      disabled={disabled || empty}
    >
      <SelectTrigger className={cn("w-full", className)}>
        <SelectValue
          placeholder={empty ? (groupsOnly ? "No groups yet" : "No categories yet") : placeholder}
        />
      </SelectTrigger>
      <SelectContent>
        {noneLabel && <SelectItem value={NONE}>{noneLabel}</SelectItem>}
        {options.map((o) => (
          <SelectItem key={o.id} value={o.id}>
            <span className={cn(o.group === null && "font-semibold")}>
              {optionLabel(o)}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

const NONE = "__none__"

export function CategoryPicker({
  options,
  value,
  header,
  onPick,
}: {
  options: Option[]
  value: string | null
  header?: React.ReactNode
  onPick: (categoryId: string | null) => void
}) {
  const [q, setQ] = useState("")
  // Phones: focusing would raise the keyboard, scroll the page and close us.
  const [autoFocus] = useState(
    () => window.matchMedia("(pointer: fine)").matches,
  )
  const shown = useMemo(() => {
    const query = q.trim().toLowerCase()
    return query
      ? options.filter((o) =>
          `${o.group ?? ""} ${o.name}`.toLowerCase().includes(query),
        )
      : options
  }, [options, q])

  return (
    <>
      {header && <div className="border-b px-3 py-2 text-xs">{header}</div>}
      <div className="p-1.5">
        <Input
          autoFocus={autoFocus}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && shown.length > 0) {
              onPick(shown[0].id)
            }
          }}
          placeholder="Find a category…"
          className="h-8 text-xs"
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-1 pb-1">
        {value != null && !q && (
          <button
            type="button"
            onClick={() => onPick(null)}
            className="text-muted-foreground hover:bg-accent flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs"
          >
            <X className="size-3.5" />
            Clear category
          </button>
        )}
        {shown.map((o) => (
          <button
            key={o.id}
            type="button"
            onClick={() => onPick(o.id)}
            className={cn(
              "hover:bg-accent flex w-full items-center gap-1 px-2 py-1.5 text-left text-xs",
              o.group === null && "font-semibold",
            )}
          >
            {o.group && (
              <span className="text-muted-foreground shrink-0">
                {o.group} ›
              </span>
            )}
            <span className="truncate">{o.name}</span>
            {value === o.id && <Check className="ml-auto size-3.5 shrink-0" />}
          </button>
        ))}
        {shown.length === 0 && (
          <div className="text-muted-foreground px-2 py-1.5 text-xs">
            No category matches.
          </div>
        )}
      </div>
      <Link
        href="/settings/categories"
        className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 border-t px-3 py-2 text-xs"
      >
        <Settings2 className="size-3.5" />
        Manage categories…
      </Link>
    </>
  )
}
