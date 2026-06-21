"use client"

import { useRef, useState } from "react"
import { Upload, FileText, Loader2 } from "lucide-react"
import { toast } from "sonner"

import type { TxRule } from "@/lib/types"
import { parseBankCsvFile, type ParsedTx } from "@/lib/csv"
import { classifyImport } from "@/lib/spending"
import { fetchTransactions, importTransactions } from "@/lib/data/transactions"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

function defaultLabel(): string {
  return new Date().toLocaleString("nb-NO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

type Preview = {
  filename: string
  parsed: ParsedTx[]
  insert: number
  update: number
  unchanged: number
}

export function CsvDropzone({
  rules,
  onImported,
}: {
  rules: TxRule[]
  onImported: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [label, setLabel] = useState(defaultLabel())

  async function handleFile(file: File) {
    if (!file.name.toLowerCase().endsWith(".csv")) {
      toast.error("Please drop a .csv file from your bank.")
      return
    }
    setBusy(true)
    try {
      const { rows, skipped } = await parseBankCsvFile(file)
      if (rows.length === 0) {
        toast.error("No transactions found in that file.")
        return
      }
      const existing = await fetchTransactions()
      const plan = classifyImport(rows, existing)
      setPreview({
        filename: file.name,
        parsed: rows,
        insert: plan.toInsert.length,
        update: plan.toUpdate.length,
        unchanged: plan.unchangedCount,
      })
      setLabel(defaultLabel())
      if (skipped > 0)
        toast.message(`${skipped} row(s) couldn't be read and were skipped.`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not read the file.")
    } finally {
      setBusy(false)
    }
  }

  async function confirmImport() {
    if (!preview) return
    setBusy(true)
    try {
      const res = await importTransactions(preview.parsed, rules, {
        label,
        filename: preview.filename,
      })
      toast.success(
        `Imported ${res.inserted} new · ${res.updated} updated · ${res.unchanged} unchanged.`,
      )
      setPreview(null)
      onImported()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Import bank transactions</CardTitle>
        <CardDescription>
          Drop your bank&apos;s CSV export here. Only new transactions are added;
          re-uploading the same file changes nothing.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div
          role="button"
          tabIndex={0}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") inputRef.current?.click()
          }}
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragOver(false)
            const file = e.dataTransfer.files?.[0]
            if (file) handleFile(file)
          }}
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors",
            dragOver
              ? "border-primary bg-primary/5"
              : "border-muted-foreground/25 hover:border-muted-foreground/50",
          )}
        >
          {busy ? (
            <Loader2 className="text-muted-foreground size-6 animate-spin" />
          ) : (
            <Upload className="text-muted-foreground size-6" />
          )}
          <p className="text-sm font-medium">
            Drag &amp; drop a .csv, or click to choose
          </p>
          <p className="text-muted-foreground text-xs">
            Semicolon-separated export (NOK), all accounts.
          </p>
          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) handleFile(file)
              e.target.value = ""
            }}
          />
        </div>

        {preview && (
          <div className="flex flex-col gap-3 rounded-lg border p-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <FileText className="size-4" />
              {preview.filename}
            </div>
            <div className="flex flex-wrap gap-4 text-sm">
              <span>
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                  {preview.insert}
                </span>{" "}
                new
              </span>
              <span>
                <span className="font-semibold text-amber-600 dark:text-amber-400">
                  {preview.update}
                </span>{" "}
                updated
              </span>
              <span className="text-muted-foreground">
                {preview.unchanged} already imported
              </span>
            </div>
            <div className="grid gap-2 sm:max-w-xs">
              <Label htmlFor="import-label">Snapshot label</Label>
              <Input
                id="import-label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. After June salary"
              />
              <p className="text-muted-foreground text-xs">
                When you took this snapshot (before/after salary or bills).
              </p>
            </div>
            <div className="flex gap-2">
              <Button onClick={confirmImport} disabled={busy}>
                {busy ? "Importing…" : "Import"}
              </Button>
              <Button
                variant="ghost"
                onClick={() => setPreview(null)}
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
