"use client"

import { useState } from "react"
import { AlertTriangle, Trash2 } from "lucide-react"
import { useSWRConfig } from "swr"
import { toast } from "sonner"

import { errMessage } from "@/lib/errors"
import { useTransactions } from "@/lib/data/use-budget"
import { deleteAllTransactions } from "@/lib/data/transactions"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export function DangerZone() {
  const { transactions } = useTransactions()
  const { mutate } = useSWRConfig()
  const [arming, setArming] = useState(false)
  const [busy, setBusy] = useState(false)
  const count = transactions.length

  async function clearAll() {
    setBusy(true)
    try {
      await deleteAllTransactions()
      await mutate("transactions")
      await mutate("imports")
      toast.success("All transactions cleared. Re-import your CSV for a clean baseline.")
      setArming(false)
    } catch (e) {
      toast.error(errMessage(e, "Could not clear transactions."))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="border-destructive/40">
      <CardHeader className="pb-2">
        <CardTitle className="text-destructive flex items-center gap-2 text-sm font-medium">
          <AlertTriangle className="size-4" />
          Danger zone
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {!arming ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-muted-foreground text-sm">
              Delete all {count} imported transactions. Budget, categories,
              groups and rules are kept.
            </span>
            <Button
              variant="outline"
              size="sm"
              className="text-destructive gap-1"
              onClick={() => setArming(true)}
            >
              <Trash2 className="size-4" />
              Clear transactions
            </Button>
          </div>
        ) : (
          <div className="border-destructive/40 flex flex-col gap-2 rounded-md border p-3">
            <p className="text-sm font-medium">
              Permanently delete all {count} transactions and import history?
            </p>
            <p className="text-muted-foreground text-xs">
              This cannot be undone. Your budget, categories, groups and rules
              are not affected — re-import your bank CSV afterwards for a clean
              set.
            </p>
            <div className="flex gap-2">
              <Button
                variant="destructive"
                size="sm"
                onClick={clearAll}
                disabled={busy}
              >
                {busy ? "Deleting…" : `Yes, delete ${count}`}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setArming(false)}
                disabled={busy}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
