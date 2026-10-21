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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

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
  large = false,
}: {
  rules: TxRule[]
  onImported: () => void
  /** The first-run drop area; otherwise a compact button-sized target. */
  large?: boolean
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
    <>
      <div
        role="button"
        tabIndex={0}
        title="Import your bank's CSV export"
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            inputRef.current?.click()
          }
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
          if (file) {
            handleFile(file)
          }
        }}
        className={cn(
          "flex cursor-pointer items-center border border-dashed transition-colors",
          large
            ? "flex-col justify-center gap-2 border-2 px-6 py-14 text-center"
            : "h-11 gap-2 px-3 sm:h-9",
          dragOver
            ? "border-primary bg-primary/5"
            : "border-muted-foreground/30 hover:border-muted-foreground/60 hover:bg-muted/40",
        )}
      >
        {busy ? (
          <Loader2 className="text-muted-foreground size-4 animate-spin" />
        ) : (
          <Upload
            className={cn("text-muted-foreground", large ? "size-6" : "size-4")}
          />
        )}
        {large ? (
          <>
            <p className="text-sm font-medium">
              Drag &amp; drop your bank&apos;s .csv, or click to choose
            </p>
            <p className="text-muted-foreground max-w-sm text-xs">
              Semicolon-separated export (NOK), all accounts. Only new
              transactions are added; re-uploading the same file changes
              nothing.
            </p>
          </>
        ) : (
          <>
            <span className="text-xs font-semibold tracking-wider uppercase">
              Import CSV
            </span>
            <span className="text-muted-foreground hidden text-xs md:inline">
              drop a file or click
            </span>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) {
              handleFile(file)
            }
            e.target.value = ""
          }}
        />
      </div>

      <Dialog
        open={!!preview}
        onOpenChange={(o) => {
          if (!o && !busy) {
            setPreview(null)
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import bank transactions</DialogTitle>
            <DialogDescription>
              Only new transactions are added; re-uploading the same file
              changes nothing.
            </DialogDescription>
          </DialogHeader>
          {preview && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-2 text-sm font-medium">
                <FileText className="size-4" />
                <span className="truncate">{preview.filename}</span>
              </div>
              <dl className="grid grid-cols-3 border text-center">
                <div className="flex flex-col gap-0.5 py-3">
                  <dt className="text-muted-foreground text-[11px] font-semibold tracking-wider uppercase">
                    New
                  </dt>
                  <dd className="text-xl font-semibold text-emerald-600 tabular-nums dark:text-emerald-400">
                    {preview.insert}
                  </dd>
                </div>
                <div className="flex flex-col gap-0.5 border-x py-3">
                  <dt className="text-muted-foreground text-[11px] font-semibold tracking-wider uppercase">
                    Updated
                  </dt>
                  <dd className="text-xl font-semibold text-amber-600 tabular-nums dark:text-amber-400">
                    {preview.update}
                  </dd>
                </div>
                <div className="flex flex-col gap-0.5 py-3">
                  <dt className="text-muted-foreground text-[11px] font-semibold tracking-wider uppercase">
                    Already in
                  </dt>
                  <dd className="text-muted-foreground text-xl font-semibold tabular-nums">
                    {preview.unchanged}
                  </dd>
                </div>
              </dl>
              <div className="grid gap-2">
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
            </div>
          )}
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setPreview(null)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button onClick={confirmImport} disabled={busy}>
              {busy ? "Importing…" : "Import"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
