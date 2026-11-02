"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { Pencil, Search, Trash2 } from "lucide-react"
import { toast } from "sonner"

import type { MatchRule, TxRule } from "@/lib/types"
import { errMessage } from "@/lib/errors"
import {
  buildTypeMap,
  deriveStem,
  effectiveCategoryId,
  matchRuleFor,
  normalizeText,
} from "@/lib/spending"
import {
  useCategories,
  useMatchRules,
  useTransactions,
  useTxRules,
  useTypeCategories,
} from "@/lib/data/use-budget"
import {
  addTextRule,
  deleteMatchRule,
  deleteRule,
  updateTxRule,
} from "@/lib/data/transactions"
import { RuleDialog } from "@/components/spending/rule-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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
import {
  CategorySelect,
  categoryOptions,
  optionLabel,
} from "@/components/spending/category-picker"

const PAGE = 30

/**
 * Every "text → category" rule, plus adding one by hand: any transaction whose
 * text contains it (ignoring the random numbers banks add) gets the category.
 */
export function RulesManager({ onChanged }: { onChanged: () => void }) {
  const { transactions } = useTransactions()
  const { categories } = useCategories()
  const { typeCategories } = useTypeCategories()
  const { rules, mutate } = useTxRules()
  const typeMap = useMemo(() => buildTypeMap(typeCategories), [typeCategories])

  const [text, setText] = useState("")
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [filter, setFilter] = useState("")
  const [showAll, setShowAll] = useState(false)
  const [confirm, setConfirm] = useState<TxRule | null>(null)
  const [edit, setEdit] = useState<{
    id: string
    pattern: string
    categoryId: string
  } | null>(null)

  const labelOf = useMemo(() => {
    const m = new Map(
      categoryOptions(categories).map((o) => [o.id, optionLabel(o)]),
    )
    return (id: string | null) => (id ? (m.get(id) ?? "—") : "—")
  }, [categories])

  // The two forms a description rule is matched against (see descMatches), once per row.
  const texts = useMemo(
    () =>
      transactions.map((t) => ({
        t,
        norm: normalizeText(t.description),
        stem: deriveStem(t.description),
      })),
    [transactions],
  )
  const matching = (r: Pick<TxRule, "match_type" | "pattern">) =>
    r.match_type === "description"
      ? texts.filter(
          (x) => x.norm.includes(r.pattern) || x.stem.includes(r.pattern),
        )
      : texts.filter(
          (x) => x.t.from_account === r.pattern || x.t.to_account === r.pattern,
        )

  const pattern = normalizeText(text)
  const existing = rules.find(
    (r) => r.match_type === "description" && r.pattern === pattern,
  )
  const preview = useMemo(() => {
    if (pattern.length < 2) {
      return null
    }
    const hits = texts.filter(
      (x) => x.norm.includes(pattern) || x.stem.includes(pattern),
    )
    const free = hits.filter((x) => effectiveCategoryId(x.t, typeMap) === null)
    return { hits, free }
  }, [pattern, texts, typeMap])

  async function add() {
    if (!categoryId || pattern.length < 2 || existing) {
      return
    }
    setSaving(true)
    try {
      const n = await addTextRule(pattern, categoryId, typeMap)
      toast.success(
        `Rule added · ${n} uncategorised transaction${n === 1 ? "" : "s"} now in ${labelOf(categoryId)}`,
      )
      setText("")
      mutate()
      onChanged()
    } catch (e) {
      toast.error(errMessage(e, "Could not add the rule."))
    } finally {
      setSaving(false)
    }
  }

  const editPattern = (r: TxRule) =>
    r.match_type === "account"
      ? (edit?.pattern ?? "").trim()
      : normalizeText(edit?.pattern)

  async function saveEdit(r: TxRule) {
    const p = editPattern(r)
    if (!edit || p.length < 2 || !edit.categoryId) {
      return
    }
    setSaving(true)
    try {
      const n = await updateTxRule(r, p, edit.categoryId, typeMap)
      toast.success(
        `Rule saved · ${n} transaction${n === 1 ? "" : "s"} now in ${labelOf(edit.categoryId)}`,
      )
      setEdit(null)
      mutate()
      onChanged()
    } catch (e) {
      toast.error(errMessage(e, "Could not save the rule."))
    } finally {
      setSaving(false)
    }
  }

  async function remove(r: TxRule) {
    try {
      await deleteRule(r.id)
      mutate()
      onChanged()
    } catch (e) {
      toast.error(errMessage(e, "Could not delete the rule."))
    }
  }

  const f = normalizeText(filter)
  const listed = [...rules]
    .reverse()
    .filter(
      (r) =>
        !f ||
        r.pattern.includes(f) ||
        labelOf(r.category_id).toLowerCase().includes(f),
    )
  const shown = showAll ? listed : listed.slice(0, PAGE)

  return (
    <div className="flex flex-col gap-4">
      <MatchRules labelOf={labelOf} onChanged={onChanged} />
      <div className="flex flex-col border">
        <div className="bg-muted/60 border-b px-3 py-2">
          <div className="text-sm font-semibold">Text rules</div>
          <p className="text-muted-foreground text-xs">
            Any transaction whose text contains a rule&apos;s words gets its
            category — numbers the bank adds are ignored, so &quot;spotify&quot;
            also catches &quot;SPOTIFY P2A4F9C1&quot;. A new rule only fills in
            transactions without a category; it never changes one you&apos;ve
            set. Future imports use the rules too.
          </p>
        </div>

        <div className="flex flex-col gap-2 border-b px-3 py-3">
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
            <Input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void add()}
              placeholder="Text to match, e.g. spotify"
              aria-label="Text to match"
            />
            <CategorySelect
              categories={categories}
              value={categoryId}
              onChange={setCategoryId}
              placeholder="Category"
            />
            <Button
              onClick={() => void add()}
              disabled={
                saving || !categoryId || pattern.length < 2 || !!existing
              }
            >
              Add rule
            </Button>
          </div>
          {existing ? (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              A rule for &quot;{pattern}&quot; already exists →{" "}
              {labelOf(existing.category_id)}.
            </p>
          ) : (
            preview && (
              <div className="text-muted-foreground flex flex-col gap-1 text-xs">
                <p>
                  Matches {preview.hits.length} transaction
                  {preview.hits.length === 1 ? "" : "s"} ·{" "}
                  <span className="text-foreground font-medium">
                    {preview.free.length} without a category
                  </span>{" "}
                  {categoryId
                    ? `would go to ${labelOf(categoryId)}`
                    : "would get the category"}
                  {preview.hits.length > preview.free.length &&
                    ` · ${preview.hits.length - preview.free.length} already categorised stay as they are`}
                </p>
                {preview.hits.length > 0 && (
                  <ul className="flex flex-col">
                    {[
                      ...new Set(
                        preview.hits.map((x) => x.t.description ?? ""),
                      ),
                    ]
                      .slice(0, 5)
                      .map((d) => (
                        <li key={d} className="truncate font-mono text-[11px]">
                          {d || "—"}
                        </li>
                      ))}
                  </ul>
                )}
              </div>
            )
          )}
        </div>

        {rules.length > 0 && (
          <label className="flex items-center gap-2 border-b px-3">
            <Search
              className="text-muted-foreground size-3.5 shrink-0"
              aria-hidden
            />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder={`Filter ${rules.length} rules`}
              className="h-9 min-w-0 flex-1 bg-transparent text-sm outline-none"
            />
          </label>
        )}
        {listed.length === 0 ? (
          <p className="text-muted-foreground px-3 py-3 text-sm">
            {rules.length ? "No rule matches the filter." : "No rules yet."}
          </p>
        ) : (
          <div className="flex flex-col divide-y">
            {shown.map((r) => {
              const n = matching(r).length
              if (edit?.id === r.id) {
                return (
                  <div
                    key={r.id}
                    className="grid gap-2 px-3 py-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto]"
                  >
                    <Input
                      value={edit.pattern}
                      onChange={(e) =>
                        setEdit({ ...edit, pattern: e.target.value })
                      }
                      onKeyDown={(e) => e.key === "Enter" && void saveEdit(r)}
                      aria-label={
                        r.match_type === "account"
                          ? "Account number"
                          : "Text to match"
                      }
                      className="font-mono"
                    />
                    <CategorySelect
                      categories={categories}
                      value={edit.categoryId}
                      onChange={(id) =>
                        setEdit({ ...edit, categoryId: id ?? edit.categoryId })
                      }
                    />
                    <Button
                      size="sm"
                      onClick={() => void saveEdit(r)}
                      disabled={saving || editPattern(r).length < 2}
                    >
                      Save
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setEdit(null)}
                    >
                      Cancel
                    </Button>
                  </div>
                )
              }
              return (
                <div
                  key={r.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-1.5"
                >
                  <span className="min-w-0 flex-1 truncate text-sm">
                    <span className="font-mono">
                      {r.match_type === "account"
                        ? `account ${r.pattern}`
                        : r.pattern}
                    </span>
                    <span className="text-muted-foreground">
                      {" "}
                      → {labelOf(r.category_id)}
                    </span>
                  </span>
                  {r.match_type === "description" ? (
                    <Link
                      href={`/transactions?tab=transactions&period=all&q=${encodeURIComponent(r.pattern)}`}
                      className="text-muted-foreground hover:text-primary text-xs tabular-nums hover:underline"
                    >
                      {n} match{n === 1 ? "" : "es"}
                    </Link>
                  ) : (
                    <span className="text-muted-foreground text-xs tabular-nums">
                      {n} match{n === 1 ? "" : "es"}
                    </span>
                  )}
                  <button
                    type="button"
                    aria-label={`Edit rule ${r.pattern}`}
                    onClick={() =>
                      setEdit({
                        id: r.id,
                        pattern: r.pattern,
                        categoryId: r.category_id ?? "",
                      })
                    }
                    className="text-muted-foreground hover:text-foreground p-1"
                  >
                    <Pencil className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete rule ${r.pattern}`}
                    onClick={() => setConfirm(r)}
                    className="text-muted-foreground hover:text-destructive p-1"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              )
            })}
            {listed.length > shown.length && (
              <button
                type="button"
                onClick={() => setShowAll(true)}
                className="text-muted-foreground hover:text-foreground px-3 py-2 text-left text-xs"
              >
                Show all {listed.length}
              </button>
            )}
          </div>
        )}

        <AlertDialog
          open={!!confirm}
          onOpenChange={(o) => !o && setConfirm(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Delete the rule &quot;{confirm?.pattern}&quot;?
              </AlertDialogTitle>
              <AlertDialogDescription>
                Transactions keep the categories they have now. Only future
                imports stop using this rule.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  if (confirm) {
                    void remove(confirm)
                  }
                  setConfirm(null)
                }}
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  )
}

const CONDITIONS: [keyof MatchRule, string][] = [
  ["description", "description"],
  ["message", "message"],
  ["type", "type"],
  ["from_account", "from"],
  ["to_account", "to"],
]

function describe(r: MatchRule): string {
  const parts = CONDITIONS.flatMap(([k, label]) =>
    r[k] === null ? [] : [`${label} “${r[k]}”`],
  )
  if (r.amount_min !== null || r.amount_max !== null) {
    parts.push(
      r.amount_min === r.amount_max
        ? `amount ${r.amount_min} kr`
        : `amount ${r.amount_min ?? 0}–${r.amount_max ?? "∞"} kr`,
    )
  }
  return parts.join(" + ")
}

/** Detailed rules: several conditions at once (message, accounts, amount), checked before text rules. */
function MatchRules({
  labelOf,
  onChanged,
}: {
  labelOf: (id: string | null) => string
  onChanged: () => void
}) {
  const { transactions } = useTransactions()
  const { matchRules, error, mutate } = useMatchRules()
  const [editing, setEditing] = useState<MatchRule | null>(null)
  const [adding, setAdding] = useState(false)

  async function remove(r: MatchRule) {
    try {
      await deleteMatchRule(r.id)
      mutate()
    } catch (e) {
      toast.error(errMessage(e, "Could not delete the rule."))
    }
  }

  return (
    <div className="flex flex-col border">
      <div className="bg-muted/60 flex items-start gap-3 border-b px-3 py-2">
        <div className="flex-1">
          <div className="text-sm font-semibold">Detailed rules</div>
          <p className="text-muted-foreground text-xs">
            Match on the message, account numbers or amount as well as the text,
            e.g. to split two fund agreements paid to the same bank. Every
            condition must match; they&apos;re checked before the rules below.
            Tip: make one straight from a transaction with “Make a rule…”.
          </p>
        </div>
        <Button size="sm" onClick={() => setAdding(true)} disabled={!!error}>
          New rule
        </Button>
      </div>
      {error ? (
        <p className="text-destructive px-3 py-3 text-sm">
          Run <code>supabase/migrations/0026_match_rules.sql</code> in the
          Supabase SQL Editor, then reload this page.
        </p>
      ) : matchRules.length === 0 ? (
        <p className="text-muted-foreground px-3 py-3 text-sm">
          No detailed rules yet.
        </p>
      ) : (
        <div className="flex flex-col divide-y">
          {matchRules.map((r) => {
            const n = transactions.filter(
              (t) => matchRuleFor(t, matchRules)?.id === r.id,
            ).length
            return (
              <div
                key={r.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-1.5"
              >
                <span className="min-w-0 flex-1 text-sm">
                  <span className="font-mono">{describe(r)}</span>
                  <span className="text-muted-foreground">
                    {" "}
                    → {labelOf(r.category_id)}
                  </span>
                </span>
                <span className="text-muted-foreground text-xs tabular-nums">
                  {n} match{n === 1 ? "" : "es"}
                </span>
                <button
                  type="button"
                  aria-label="Edit rule"
                  onClick={() => setEditing(r)}
                  className="text-muted-foreground hover:text-foreground p-1"
                >
                  <Pencil className="size-3.5" />
                </button>
                <button
                  type="button"
                  aria-label="Delete rule"
                  onClick={() => void remove(r)}
                  className="text-muted-foreground hover:text-destructive p-1"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            )
          })}
        </div>
      )}
      <RuleDialog
        open={adding || !!editing}
        tx={null}
        rule={editing}
        onClose={() => {
          setAdding(false)
          setEditing(null)
        }}
        onSaved={onChanged}
      />
    </div>
  )
}
