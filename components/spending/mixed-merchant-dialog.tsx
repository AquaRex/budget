"use client"

import type { Transaction } from "@/lib/types"
import {
  effectiveCategoryId,
  sourceKeyFor,
  txMatchesSource,
  type TypeMap,
} from "@/lib/spending"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"

export type MerchantMix = {
  merchant: string
  target: string // the category name being applied
  total: number
  // Categories its rows sit in today other than the target, biggest first.
  others: { name: string; count: number }[]
}

/**
 * Where a merchant's rows sit today. Returns null when they're all in one
 * category (or none), so a merchant-wide change can go ahead without asking.
 */
export function merchantMix(
  all: Transaction[],
  tx: Transaction,
  targetId: string | null,
  typeMap: TypeMap,
  nameOf: (id: string | null) => string,
): MerchantMix | null {
  const src = sourceKeyFor(tx)
  if (!src) {
    return null
  }
  const counts = new Map<string, number>()
  let total = 0
  for (const t of all) {
    if (txMatchesSource(t, src.matchType, src.pattern)) {
      total++
      const id = effectiveCategoryId(t, typeMap)
      if (id) {
        counts.set(id, (counts.get(id) ?? 0) + 1)
      }
    }
  }
  if (counts.size < 2) {
    return null
  }
  return {
    merchant: tx.description || tx.type || "this merchant",
    target: nameOf(targetId),
    total,
    others: [...counts.entries()]
      .filter(([id]) => id !== targetId)
      .sort((a, b) => b[1] - a[1])
      .map(([id, count]) => ({ name: nameOf(id), count })),
  }
}

export function MixedMerchantDialog({
  mix,
  onAll,
  onOnlyThis,
  onCancel,
}: {
  mix: MerchantMix | null
  onAll: () => void
  /** Offered when the change started from a single transaction. */
  onOnlyThis?: () => void
  onCancel: () => void
}) {
  const [first, ...rest] = mix?.others ?? []
  return (
    <AlertDialog open={!!mix} onOpenChange={(o) => !o && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {mix?.merchant} is split across categories
          </AlertDialogTitle>
          <AlertDialogDescription>
            {first && (
              <>
                {first.count} of {mix?.total} are currently in {first.name}
                {rest.map((o) => `, ${o.count} in ${o.name}`).join("")}. Move all{" "}
                {mix?.total} to {mix?.target}?
              </>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          {onOnlyThis && (
            <Button variant="outline" onClick={onOnlyThis}>
              Only this one
            </Button>
          )}
          <Button onClick={onAll}>Move all {mix?.total}</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
