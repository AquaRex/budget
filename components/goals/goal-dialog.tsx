"use client"

import { useState } from "react"
import { toast } from "sonner"

import { errMessage } from "@/lib/errors"
import { MONTHS_LONG } from "@/lib/budget"
import {
  createGoal,
  updateGoal,
  type Goal,
  type GoalInput,
} from "@/lib/data/goals"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { kr } from "@/components/stats/display"
import { parseNumber } from "@/components/savings/format"

/** Add a goal (goal = null) or edit one. */
export function GoalDialog({
  open,
  goal,
  nextSortOrder,
  holdingsValue,
  thisYear,
  onClose,
  onSaved,
}: {
  open: boolean
  goal: Goal | null
  nextSortOrder: number
  holdingsValue: number
  thisYear: number
  onClose: () => void
  onSaved: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        {open && (
          <GoalForm
            goal={goal}
            nextSortOrder={nextSortOrder}
            holdingsValue={holdingsValue}
            thisYear={thisYear}
            onClose={onClose}
            onSaved={onSaved}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function GoalForm({
  goal,
  nextSortOrder,
  holdingsValue,
  thisYear,
  onClose,
  onSaved,
}: {
  goal: Goal | null
  nextSortOrder: number
  holdingsValue: number
  thisYear: number
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState(goal?.name ?? "")
  const [target, setTarget] = useState(goal ? String(goal.target_amount) : "")
  const [year, setYear] = useState(String(goal?.target_year ?? thisYear + 3))
  const [month, setMonth] = useState(goal?.target_month ?? 12)
  const [start, setStart] = useState(goal ? String(goal.start_amount) : "")
  const [includeHoldings, setIncludeHoldings] = useState(
    goal?.include_holdings ?? true,
  )
  const [saving, setSaving] = useState(false)

  const input: GoalInput | null = (() => {
    const t = parseNumber(target)
    const y = Number(year)
    const s = parseNumber(start) ?? 0
    if (!name.trim() || !t || !Number.isInteger(y) || y < 2000 || y > 2100) {
      return null
    }
    return {
      name: name.trim(),
      target_amount: t,
      target_year: y,
      target_month: month,
      start_amount: s,
      include_holdings: includeHoldings,
    }
  })()

  async function save() {
    if (!input) {
      return
    }
    setSaving(true)
    try {
      if (goal) {
        await updateGoal(goal.id, input)
      } else {
        await createGoal(input, nextSortOrder)
      }
      onSaved()
      onClose()
    } catch (e) {
      toast.error(errMessage(e, "Could not save the goal."))
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{goal ? `Edit ${goal.name}` : "Add a goal"}</DialogTitle>
        <DialogDescription>
          An amount to have saved by a certain month. The goal is checked
          against your budget and your actual spending.
        </DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="goal-name">Name</Label>
          <Input
            id="goal-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. House deposit"
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_6rem]">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="goal-target">Amount (kr)</Label>
            <Input
              id="goal-target"
              inputMode="decimal"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder="500 000"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>By the end of</Label>
            <Select
              value={String(month)}
              onValueChange={(v) => setMonth(Number(v))}
            >
              <SelectTrigger className="w-36">
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
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="goal-year">Year</Label>
            <Input
              id="goal-year"
              inputMode="numeric"
              value={year}
              onChange={(e) => setYear(e.target.value)}
            />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="goal-start">Already saved towards it (kr)</Label>
          <Input
            id="goal-start"
            inputMode="decimal"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            placeholder="0"
          />
          <p className="text-muted-foreground text-xs">
            Money outside the Savings tab, e.g. a savings account.
          </p>
        </div>
        <label className="flex items-center justify-between gap-3 border px-3 py-2.5">
          <span className="flex flex-col gap-0.5">
            <span className="text-sm font-medium">
              Count my Savings tab holdings
            </span>
            <span className="text-muted-foreground text-xs">
              Adds what your funds and shares are worth today (
              {kr(holdingsValue)}).
            </span>
          </span>
          <Switch
            checked={includeHoldings}
            onCheckedChange={setIncludeHoldings}
          />
        </label>
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={save} disabled={!input || saving}>
          {goal ? "Save" : "Add goal"}
        </Button>
      </DialogFooter>
    </>
  )
}
