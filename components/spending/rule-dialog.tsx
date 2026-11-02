"use client"

import { useMemo, useState } from "react"
import { toast } from "sonner"

import type { MatchRule, MatchRuleInput, Transaction } from "@/lib/types"
import { errMessage } from "@/lib/errors"
import {
  buildTypeMap,
  deriveStem,
  effectiveCategoryId,
  effectiveDate,
  matchRuleFor,
} from "@/lib/spending"
import { saveMatchRule } from "@/lib/data/transactions"
import {
  useCategories,
  useMatchRules,
  useTransactions,
  useTypeCategories,
} from "@/lib/data/use-budget"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { CategorySelect } from "@/components/spending/category-picker"
import { formatNOK } from "@/lib/format"
import { parseNumber } from "@/components/savings/format"

type TextField =
  | "description"
  | "message"
  | "type"
  | "from_account"
  | "to_account"

const FIELDS: { key: TextField; label: string; hint: string }[] = [
  { key: "description", label: "Description", hint: "contains" },
  { key: "message", label: "Message", hint: "contains" },
  { key: "type", label: "Type", hint: "contains" },
  { key: "from_account", label: "From account", hint: "is exactly" },
  { key: "to_account", label: "To account", hint: "is exactly" },
]

type Draft = Record<TextField, { on: boolean; value: string }> & {
  amount: { on: boolean; min: string; max: string }
}

function draftFrom(tx: Transaction | null, rule: MatchRule | null): Draft {
  const text = (key: TextField, fromTx: string | null, on: boolean) =>
    rule
      ? { on: rule[key] !== null, value: rule[key] ?? fromTx ?? "" }
      : { on: on && !!fromTx, value: fromTx ?? "" }
  const amount = tx ? String(Math.abs(Number(tx.amount))) : ""
  return {
    description: text(
      "description",
      tx ? deriveStem(tx.description) || tx.description : null,
      true,
    ),
    message: text(
      "message",
      tx?.message ?? null,
      (tx?.message?.length ?? 0) <= 40,
    ),
    type: text("type", tx?.type ?? null, false),
    from_account: text("from_account", tx?.from_account ?? null, false),
    to_account: text("to_account", tx?.to_account ?? null, false),
    amount: rule
      ? {
          on: rule.amount_min !== null || rule.amount_max !== null,
          min: rule.amount_min === null ? amount : String(rule.amount_min),
          max: rule.amount_max === null ? amount : String(rule.amount_max),
        }
      : { on: false, min: amount, max: amount },
  }
}

/** Create a detailed rule from a transaction (or from scratch), or edit one. */
export function RuleDialog({
  open,
  tx,
  rule,
  onClose,
  onSaved,
}: {
  open: boolean
  tx: Transaction | null
  rule: MatchRule | null
  onClose: () => void
  onSaved: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-xl">
        {open && (
          <RuleForm tx={tx} rule={rule} onClose={onClose} onSaved={onSaved} />
        )}
      </DialogContent>
    </Dialog>
  )
}

function RuleForm({
  tx,
  rule,
  onClose,
  onSaved,
}: {
  tx: Transaction | null
  rule: MatchRule | null
  onClose: () => void
  onSaved: () => void
}) {
  const { categories } = useCategories()
  const { transactions } = useTransactions()
  const { typeCategories } = useTypeCategories()
  const { matchRules, mutate } = useMatchRules()
  const typeMap = useMemo(() => buildTypeMap(typeCategories), [typeCategories])
  const [draft, setDraft] = useState(() => draftFrom(tx, rule))
  const [categoryId, setCategoryId] = useState<string | null>(
    rule?.category_id ?? tx?.category_id ?? null,
  )
  const [overwrite, setOverwrite] = useState(true)
  const [saving, setSaving] = useState(false)

  const input: MatchRuleInput | null = (() => {
    const text = (key: TextField) =>
      draft[key].on && draft[key].value.trim() ? draft[key].value.trim() : null
    const min = draft.amount.on ? parseNumber(draft.amount.min) : null
    const max = draft.amount.on ? parseNumber(draft.amount.max) : null
    const out = {
      description: text("description"),
      message: text("message"),
      type: text("type"),
      from_account: text("from_account"),
      to_account: text("to_account"),
      amount_min: min === null ? null : Math.abs(min),
      amount_max: max === null ? null : Math.abs(max),
      category_id: categoryId ?? "",
    }
    const any = Object.entries(out).some(
      ([k, v]) => k !== "category_id" && v !== null,
    )
    if (
      !categoryId ||
      !any ||
      (out.amount_min !== null &&
        out.amount_max !== null &&
        out.amount_min > out.amount_max)
    ) {
      return null
    }
    return out
  })()

  // What the rule would decide, given the rules already saved (more conditions win).
  const preview = useMemo(() => {
    if (!input) {
      return null
    }
    const self = {
      ...input,
      id: rule?.id ?? "draft",
      created_at: rule?.created_at ?? "9999",
    }
    const others = matchRules.filter((r) => r.id !== self.id)
    const hits = transactions.filter(
      (t) => matchRuleFor(t, [...others, self])?.id === self.id,
    )
    const change = hits.filter(
      (t) =>
        t.category_id !== input.category_id &&
        (overwrite || effectiveCategoryId(t, typeMap) === null),
    )
    return { hits, change }
  }, [input, matchRules, rule, transactions, overwrite, typeMap])

  const set = (
    key: TextField,
    patch: Partial<{ on: boolean; value: string }>,
  ) => setDraft((d) => ({ ...d, [key]: { ...d[key], ...patch } }))

  async function save() {
    if (!input) {
      return
    }
    setSaving(true)
    try {
      const n = await saveMatchRule(input, overwrite, typeMap, rule?.id)
      toast.success(
        `Rule saved · ${n} transaction${n === 1 ? "" : "s"} moved to its category.`,
      )
      mutate()
      onSaved()
      onClose()
    } catch (e) {
      toast.error(errMessage(e, "Could not save the rule."))
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{rule ? "Edit rule" : "Make a rule"}</DialogTitle>
        <DialogDescription>
          Tick what must match. A transaction gets the category only when every
          ticked line matches, so you can split one merchant by its message,
          account or amount. These rules win over merchant rules, also on future
          imports.
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-col gap-4">
        <div className="flex flex-col divide-y border">
          {FIELDS.map((f) => (
            <label
              key={f.key}
              className="grid grid-cols-[auto_7.5rem_minmax(0,1fr)] items-center gap-2 px-2.5 py-1.5"
            >
              <input
                type="checkbox"
                checked={draft[f.key].on}
                onChange={(e) => set(f.key, { on: e.target.checked })}
              />
              <span className="flex flex-col">
                <span className="text-sm">{f.label}</span>
                <span className="text-muted-foreground text-[11px]">
                  {f.hint}
                </span>
              </span>
              <Input
                value={draft[f.key].value}
                onChange={(e) =>
                  set(f.key, { value: e.target.value, on: true })
                }
                placeholder={tx ? "— empty on this transaction" : ""}
                className="h-8 font-mono text-xs"
              />
            </label>
          ))}
          <div className="grid grid-cols-[auto_7.5rem_minmax(0,1fr)] items-center gap-2 px-2.5 py-1.5">
            <input
              type="checkbox"
              aria-label="Match the amount"
              checked={draft.amount.on}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  amount: { ...d.amount, on: e.target.checked },
                }))
              }
            />
            <span className="flex flex-col">
              <span className="text-sm">Amount</span>
              <span className="text-muted-foreground text-[11px]">
                from – to, kr
              </span>
            </span>
            <div className="flex items-center gap-2">
              {(["min", "max"] as const).map((k, n) => (
                <span key={k} className="flex flex-1 items-center gap-2">
                  {n === 1 && <span className="text-muted-foreground">–</span>}
                  <Input
                    aria-label={k === "min" ? "Amount from" : "Amount to"}
                    inputMode="decimal"
                    value={draft.amount[k]}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        amount: { ...d.amount, [k]: e.target.value, on: true },
                      }))
                    }
                    className="h-8 text-right text-xs tabular-nums"
                  />
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Category</Label>
          <CategorySelect
            categories={categories}
            value={categoryId}
            onChange={setCategoryId}
          />
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={overwrite}
            onChange={(e) => setOverwrite(e.target.checked)}
          />
          Also move matching transactions that already have a category
        </label>

        {preview && (
          <div className="text-muted-foreground flex flex-col gap-1 text-xs">
            <p>
              Matches {preview.hits.length} transaction
              {preview.hits.length === 1 ? "" : "s"} ·{" "}
              <span className="text-foreground font-medium">
                {preview.change.length} would move
              </span>
            </p>
            {preview.hits.length > 0 && (
              <ul className="flex flex-col">
                {preview.hits.slice(0, 5).map((t) => (
                  <li
                    key={t.id}
                    className="grid grid-cols-[4.5rem_minmax(0,1fr)_auto] gap-2 font-mono text-[11px]"
                  >
                    <span>{effectiveDate(t)}</span>
                    <span className="truncate">
                      {t.description}
                      {t.message && ` · ${t.message}`}
                    </span>
                    <span className="tabular-nums">
                      {formatNOK(Number(t.amount))}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={save} disabled={!input || saving}>
          {saving ? "Saving…" : "Save rule"}
        </Button>
      </DialogFooter>
    </>
  )
}
