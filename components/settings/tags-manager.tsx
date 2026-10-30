"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Pencil, Tag, Trash2 } from "lucide-react"
import { toast } from "sonner"

import type { Label } from "@/lib/types"
import { formatNOK } from "@/lib/format"
import { deleteLabel, renameLabel } from "@/lib/data/labels"
import { useLabels, useTransactions } from "@/lib/data/use-budget"
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

/** Tags are free markers on transactions; they don't change any totals. */
export function TagsManager({ onChanged }: { onChanged: () => void }) {
  const router = useRouter()
  const { labels, mutate } = useLabels()
  const { transactions } = useTransactions()
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState("")
  const [confirm, setConfirm] = useState<Label | null>(null)

  const totals = useMemo(() => {
    const m = new Map<string, { count: number; out: number; inn: number }>()
    for (const t of transactions) {
      if (!t.label_id) {
        continue
      }
      // Every tagged row counts (deleting removes the tag from all of them);
      // excluded rows just don't add to the money.
      const s = m.get(t.label_id) ?? { count: 0, out: 0, inn: 0 }
      s.count++
      m.set(t.label_id, s)
      if (t.is_excluded) {
        continue
      }
      const a = Number(t.amount)
      if (a < 0) {
        s.out -= a
      } else {
        s.inn += a
      }
      m.set(t.label_id, s)
    }
    return m
  }, [transactions])

  async function act(fn: () => Promise<unknown>, err: string) {
    try {
      await fn()
      mutate()
      onChanged()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : err)
    }
  }

  async function commit(l: Label) {
    const name = draft.trim()
    setEditing(null)
    if (name && name !== l.name) {
      await act(() => renameLabel(l.id, name), "Could not rename.")
    }
  }

  const sorted = [...labels].sort((a, b) => a.name.localeCompare(b.name))
  const confirmCount = confirm ? (totals.get(confirm.id)?.count ?? 0) : 0

  return (
    <div className="flex flex-col border">
      <div className="bg-muted/60 border-b px-3 py-2">
        <div className="text-sm font-semibold">Tags</div>
        <p className="text-muted-foreground text-xs">
          Free markers on transactions (e.g. a trip or a game). Add them from the
          Transactions list; they never move money between categories.
        </p>
      </div>
      {sorted.length === 0 ? (
        <p className="text-muted-foreground px-3 py-3 text-sm">No tags yet.</p>
      ) : (
        <div className="flex flex-col divide-y">
          {sorted.map((l) => {
            const s = totals.get(l.id)
            return (
              <div key={l.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-1.5">
                <Tag className="text-muted-foreground size-3.5 shrink-0" />
                <div className="min-w-0 flex-1 text-sm">
                  {editing === l.id ? (
                    <Input
                      autoFocus
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onBlur={() => commit(l)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          commit(l)
                        } else if (e.key === "Escape") {
                          setEditing(null)
                        }
                      }}
                      className="h-7 w-48 text-sm"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() =>
                        router.push(`/transactions?tab=transactions&period=all&label=${l.id}`)
                      }
                      className="hover:text-primary truncate hover:underline"
                    >
                      {l.name}
                    </button>
                  )}
                </div>
                <span className="text-muted-foreground text-xs tabular-nums">
                  {s?.count ?? 0} tx · out {formatNOK(s?.out ?? 0)}
                  {s && s.inn > 0 && ` · in ${formatNOK(s.inn)}`}
                </span>
                <button
                  type="button"
                  aria-label={`Rename ${l.name}`}
                  onClick={() => {
                    setEditing(l.id)
                    setDraft(l.name)
                  }}
                  className="text-muted-foreground hover:text-foreground p-1"
                >
                  <Pencil className="size-3.5" />
                </button>
                <button
                  type="button"
                  aria-label={`Delete ${l.name}`}
                  onClick={() => setConfirm(l)}
                  className="text-muted-foreground hover:text-destructive p-1"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            )
          })}
        </div>
      )}
      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete the tag “{confirm?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              It&apos;s removed from {confirmCount} transaction{confirmCount === 1 ? "" : "s"}.
              The transactions themselves, their categories and every total stay
              as they are.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const l = confirm
                setConfirm(null)
                if (l) {
                  act(() => deleteLabel(l.id), "Could not delete.")
                }
              }}
            >
              Delete tag
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
