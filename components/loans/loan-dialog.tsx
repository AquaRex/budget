"use client"

import { useState } from "react"
import { toast } from "sonner"

import { errMessage } from "@/lib/errors"
import { MONTHS_LONG } from "@/lib/budget"
import {
  createLoan,
  updateLoan,
  type Loan,
  type LoanInput,
} from "@/lib/data/loans"
import { useCategories } from "@/lib/data/use-budget"
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
import { CategorySelect } from "@/components/spending/category-picker"
import { parseNumber } from "@/components/savings/format"

/** Add a loan (loan = null) or edit one. */
export function LoanDialog({
  open,
  loan,
  nextSortOrder,
  thisYear,
  thisMonth,
  onClose,
  onSaved,
}: {
  open: boolean
  loan: Loan | null
  nextSortOrder: number
  thisYear: number
  thisMonth: number
  onClose: () => void
  onSaved: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        {open && (
          <LoanForm
            loan={loan}
            nextSortOrder={nextSortOrder}
            thisYear={thisYear}
            thisMonth={thisMonth}
            onClose={onClose}
            onSaved={onSaved}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function LoanForm({
  loan,
  nextSortOrder,
  thisYear,
  thisMonth,
  onClose,
  onSaved,
}: {
  loan: Loan | null
  nextSortOrder: number
  thisYear: number
  thisMonth: number
  onClose: () => void
  onSaved: () => void
}) {
  const { categories } = useCategories()
  const [name, setName] = useState(loan?.name ?? "")
  const [balance, setBalance] = useState(loan ? String(loan.balance) : "")
  const [interest, setInterest] = useState(
    loan ? String(loan.interest_pct) : "",
  )
  const [categoryId, setCategoryId] = useState<string | null>(
    loan?.category_id ?? null,
  )
  const [month, setMonth] = useState(loan?.start_month ?? thisMonth)
  const [year, setYear] = useState(String(loan?.start_year ?? thisYear))
  const [payment, setPayment] = useState(
    loan?.monthly_payment === null || loan?.monthly_payment === undefined
      ? ""
      : String(loan.monthly_payment),
  )
  const [history, setHistory] = useState(loan?.include_history ?? true)
  const [saving, setSaving] = useState(false)

  const input: LoanInput | null = (() => {
    const b = parseNumber(balance)
    const r = parseNumber(interest)
    const y = Number(year)
    const p = payment.trim() ? parseNumber(payment) : null
    if (
      !name.trim() ||
      !categoryId ||
      !b ||
      b <= 0 ||
      r === null ||
      r < 0 ||
      r >= 100 ||
      !Number.isInteger(y) ||
      y < 2000 ||
      y > 2100 ||
      (payment.trim() !== "" && (p === null || p <= 0))
    ) {
      return null
    }
    return {
      name: name.trim(),
      category_id: categoryId,
      balance: b,
      interest_pct: r,
      start_year: y,
      start_month: month,
      monthly_payment: p,
      include_history: history,
    }
  })()

  async function save() {
    if (!input) {
      return
    }
    setSaving(true)
    try {
      if (loan) {
        await updateLoan(loan.id, input)
      } else {
        await createLoan(input, nextSortOrder)
      }
      onSaved()
      onClose()
    } catch (e) {
      toast.error(errMessage(e, "Could not save the loan."))
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{loan ? `Edit ${loan.name}` : "Add a loan"}</DialogTitle>
        <DialogDescription>
          Payments are the money going out in the category you pick.
        </DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="loan-name">Name</Label>
          <Input
            id="loan-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Mortgage, Car loan"
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_8rem]">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="loan-balance">Amount owed (kr)</Label>
            <Input
              id="loan-balance"
              inputMode="decimal"
              value={balance}
              onChange={(e) => setBalance(e.target.value)}
              placeholder="2 500 000"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="loan-interest">Interest % / yr</Label>
            <Input
              id="loan-interest"
              inputMode="decimal"
              value={interest}
              onChange={(e) => setInterest(e.target.value)}
              placeholder="5.2"
            />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-[auto_6rem]">
          <div className="flex flex-col gap-1.5">
            <Label>Owed at the start of</Label>
            <Select
              value={String(month)}
              onValueChange={(v) => setMonth(Number(v))}
            >
              <SelectTrigger className="w-full sm:w-44">
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
            <Label htmlFor="loan-year">Year</Label>
            <Input
              id="loan-year"
              inputMode="numeric"
              value={year}
              onChange={(e) => setYear(e.target.value)}
            />
          </div>
          <p className="text-muted-foreground text-xs sm:col-span-2">
            Payments from this month on are taken off the amount.
          </p>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Paid from category</Label>
          <CategorySelect
            categories={categories}
            value={categoryId}
            onChange={setCategoryId}
          />
          <p className="text-muted-foreground text-xs">
            A group counts every category in it.
          </p>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="loan-payment">Monthly payment (optional)</Label>
          <Input
            id="loan-payment"
            inputMode="decimal"
            value={payment}
            onChange={(e) => setPayment(e.target.value)}
            placeholder="Average of your latest payments"
            className="sm:max-w-60"
          />
          <p className="text-muted-foreground text-xs">
            Used for the months ahead. Leave empty to repeat your latest
            payments.
          </p>
        </div>
        <label className="flex items-center justify-between gap-3 border px-3 py-2.5">
          <span className="flex flex-col gap-0.5">
            <span className="text-sm font-medium">
              Work out the history from earlier payments
            </span>
            <span className="text-muted-foreground text-xs">
              Goes back through the category&apos;s payments before the start
              month to show what you owed then. Turn off if older payments in
              the category aren&apos;t for this loan.
            </span>
          </span>
          <Switch checked={history} onCheckedChange={setHistory} />
        </label>
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={save} disabled={!input || saving}>
          {loan ? "Save" : "Add loan"}
        </Button>
      </DialogFooter>
    </>
  )
}
