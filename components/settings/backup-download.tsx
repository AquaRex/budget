"use client"

import { useState } from "react"
import { DatabaseBackup, Loader2 } from "lucide-react"
import { toast } from "sonner"

import { buildBackup, downloadBackup } from "@/lib/data/backup"
import { useDemoMode } from "@/lib/demo-mode"
import { errMessage } from "@/lib/errors"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

/** Download every table you own, rows exactly as stored, as one JSON file. */
export function BackupDownload() {
  const demo = useDemoMode()
  const [progress, setProgress] = useState<string | null>(null)

  async function run() {
    try {
      const backup = await buildBackup((t, i, n) =>
        setProgress(`${t} (${i + 1}/${n})`),
      )
      downloadBackup(backup)
      const rows = Object.values(backup.tables).reduce((s, t) => s + t.count, 0)
      const failed = Object.entries(backup.tables).filter(([, t]) => t.error)
      if (failed.length) {
        toast.warning(
          `Backup saved, but ${failed.length} table(s) had problems: ${failed
            .map(([n, t]) => `${n} (${t.error})`)
            .join(", ")}`,
        )
      } else {
        toast.success(
          `Backup saved — ${rows} rows from ${Object.keys(backup.tables).length} tables.`,
        )
      }
    } catch (e) {
      toast.error(errMessage(e, "Could not create the backup."))
    } finally {
      setProgress(null)
    }
  }

  return (
    <Card size="sm">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <DatabaseBackup className="size-4" />
          Backup
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-muted-foreground text-sm">
          Download all your data — every table, exactly as stored in the
          database — as one JSON file. Nothing is changed.
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={run}
          disabled={progress !== null || demo !== "off"}
          title={
            demo !== "off"
              ? "Turn off demo mode first (amounts would be scrambled)"
              : undefined
          }
        >
          {progress ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              {progress}
            </>
          ) : (
            "Download backup"
          )}
        </Button>
      </CardContent>
    </Card>
  )
}
