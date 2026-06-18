"use client"

import { useId, useState } from "react"
import { toast } from "sonner"

import type { Entry, EntryKind } from "@/lib/types"
import { MONTHS_LONG } from "@/lib/budget"
import { createEntry, updateEntry, setAmount } from "@/lib/data/entries"
import { createCategory } from "@/lib/data/categories"
import { createMethod } from "@/lib/data/methods"
import { useCategories, useMethods } from "@/lib/data/use-budget"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

type Props = {
  kind: EntryKind
  open: boolean
  onOpenChange: (open: boolean) => void
  entry?: Entry | null
  /** Prefill the category for a new entry (per-category "Add" button). */
  presetCategory?: string
  onSaved: () => void
}

type FormState = {
  name: string
  category: string
  method: string
  due_day: string
  is_recurring: boolean
  amount: string
  month: string
  is_active: boolean
}

function emptyForm(): FormState {
  return {
    name: "",
    category: "",
    method: "",
    due_day: "1",
    is_recurring: true,
    amount: "",
    month: String(new Date().getMonth() + 1),
    is_active: true,
  }
}

export function EntryDialog({
  kind,
  open,
  onOpenChange,
  entry,
  presetCategory,
  onSaved,
}: Props) {
  const isBill = kind === "bill"
  const catListId = useId()
  const methodListId = useId()
  const { categories, mutate: mutateCategories } = useCategories(kind)
  const { methods, mutate: mutateMethods } = useMethods()

  const [form, setForm] = useState<FormState>(() => emptyForm())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Reset form during render when the open target changes.
  const sig = open
    ? entry
      ? entry.id
      : `new:${presetCategory ?? ""}`
    : "closed"
  const [activeSig, setActiveSig] = useState(sig)
  if (sig !== activeSig) {
    setActiveSig(sig)
    if (open) {
      setError(null)
      if (entry) {
        const catName =
          categories.find((c) => c.id === entry.category_id)?.name ?? ""
        const methodName =
          methods.find((m) => m.id === entry.method_id)?.name ?? ""
        setForm({
          name: entry.name,
          category: catName,
          method: methodName,
          due_day: String(entry.due_day),
          is_recurring: entry.is_recurring,
          amount: entry.is_recurring ? String(entry.default_amount) : "",
          month: String(new Date().getMonth() + 1),
          is_active: entry.is_active,
        })
      } else {
        setForm({ ...emptyForm(), category: presetCategory ?? "" })
      }
    }
  }

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  const isCreate = !entry
  const isSalary = !!entry?.is_salary
  const showOneTimeAmount = isCreate && !form.is_recurring

  // Resolve a typed category/method name to an id, creating it when new.
  async function resolveCategoryId(): Promise<string | null> {
    const name = form.category.trim()
    if (!name) return null
    const existing = categories.find(
      (c) => c.name.toLowerCase() === name.toLowerCase(),
    )
    if (existing) return existing.id
    const created = await createCategory(kind, name)
    await mutateCategories()
    return created.id
  }
  async function resolveMethodId(): Promise<string | null> {
    const name = form.method.trim()
    if (!name) return null
    const existing = methods.find(
      (m) => m.name.toLowerCase() === name.toLowerCase(),
    )
    if (existing) return existing.id
    const created = await createMethod(name)
    await mutateMethods()
    return created.id
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const due = Number(form.due_day)
    if (!form.name.trim()) return setError("Please enter a name.")
    if (!Number.isInteger(due) || due < 1 || due > 31)
      return setError("Expected day must be between 1 and 31.")

    let defaultAmount = 0
    if (form.is_recurring && !isSalary) {
      defaultAmount = Number(form.amount)
      if (!Number.isFinite(defaultAmount) || defaultAmount < 0)
        return setError("Monthly amount must be a positive number.")
    }
    let oneTimeAmount = 0
    if (showOneTimeAmount) {
      oneTimeAmount = Number(form.amount)
      if (!Number.isFinite(oneTimeAmount) || oneTimeAmount <= 0)
        return setError("Enter the one-time amount.")
    }

    setSaving(true)
    try {
      const [categoryId, methodId] = await Promise.all([
        resolveCategoryId(),
        resolveMethodId(),
      ])
      const payload = {
        kind,
        name: form.name.trim(),
        category_id: categoryId,
        method_id: methodId,
        due_day: due,
        is_recurring: form.is_recurring,
        default_amount: defaultAmount,
        is_active: form.is_active,
      }
      if (entry) {
        await updateEntry(entry.id, payload)
      } else {
        const created = await createEntry(payload)
        if (showOneTimeAmount) {
          await setAmount(created.id, Number(form.month), oneTimeAmount)
        }
      }
      toast.success(entry ? "Changes saved." : "Added.")
      onOpenChange(false)
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save. Try again.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={onSubmit}>
          <DialogHeader>
            <DialogTitle>
              {entry ? "Edit" : "Add"} {isBill ? "bill" : "income"}
            </DialogTitle>
            <DialogDescription>
              {isSalary
                ? "Amounts for this row come from the Salary calculator. Edit the name, category or method here."
                : form.is_recurring
                  ? "Recurring every month (override individual months in the grid)."
                  : "A one-time payment in a single month."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={form.name}
                placeholder={isBill ? "Rent, Netflix…" : "Salary, Bonus…"}
                onChange={(e) => set("name", e.target.value)}
                autoFocus
              />
            </div>

            {!isSalary && (
              <div className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <Label htmlFor="recurring">Recurring monthly</Label>
                  <p className="text-muted-foreground text-xs">
                    Off = a one-time payment.
                  </p>
                </div>
                <Switch
                  id="recurring"
                  checked={form.is_recurring}
                  onCheckedChange={(v) => set("is_recurring", v)}
                />
              </div>
            )}

            {!isSalary && (
              <div className="grid grid-cols-2 gap-4">
                {form.is_recurring ? (
                  <div className="grid gap-2">
                    <Label htmlFor="amount">Monthly amount (kr)</Label>
                    <Input
                      id="amount"
                      inputMode="decimal"
                      value={form.amount}
                      placeholder="0"
                      onChange={(e) => set("amount", e.target.value)}
                    />
                  </div>
                ) : showOneTimeAmount ? (
                  <div className="grid gap-2">
                    <Label htmlFor="amount">Amount (kr)</Label>
                    <Input
                      id="amount"
                      inputMode="decimal"
                      value={form.amount}
                      placeholder="0"
                      onChange={(e) => set("amount", e.target.value)}
                    />
                  </div>
                ) : (
                  <div className="text-muted-foreground col-span-1 self-end text-xs">
                    Edit amounts directly in the grid.
                  </div>
                )}

                <div className="grid gap-2">
                  <Label htmlFor="due_day">Expected day</Label>
                  <Input
                    id="due_day"
                    inputMode="numeric"
                    value={form.due_day}
                    placeholder="1–31"
                    onChange={(e) => set("due_day", e.target.value)}
                  />
                </div>
              </div>
            )}

            {showOneTimeAmount && (
              <div className="grid gap-2">
                <Label>Month</Label>
                <Select
                  value={form.month}
                  onValueChange={(v) => set("month", v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MONTHS_LONG.map((m, i) => (
                      <SelectItem key={m} value={String(i + 1)}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="category">Category</Label>
                <Input
                  id="category"
                  list={catListId}
                  value={form.category}
                  placeholder="Pick or type new…"
                  onChange={(e) => set("category", e.target.value)}
                />
                <datalist id={catListId}>
                  {categories.map((c) => (
                    <option key={c.id} value={c.name} />
                  ))}
                </datalist>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="method">Method</Label>
                <Input
                  id="method"
                  list={methodListId}
                  value={form.method}
                  placeholder="Visa, Paypal…"
                  onChange={(e) => set("method", e.target.value)}
                />
                <datalist id={methodListId}>
                  {methods.map((m) => (
                    <option key={m.id} value={m.name} />
                  ))}
                </datalist>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <Label htmlFor="active">Active</Label>
                <p className="text-muted-foreground text-xs">
                  Include this in totals.
                </p>
              </div>
              <Switch
                id="active"
                checked={form.is_active}
                onCheckedChange={(v) => set("is_active", v)}
              />
            </div>

            {error && <p className="text-destructive text-sm">{error}</p>}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : entry ? "Save changes" : "Add"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
