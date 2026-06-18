"use client"

import { useState } from "react"
import { ChevronDown, GripVertical, Settings2 } from "lucide-react"
import { toast } from "sonner"

import {
  computeSalary,
  defaultSalaryProfile,
  yearlyFromMonthlyAfterTax,
  type SalaryProfile,
} from "@/lib/salary"
import { MONTHS_LONG } from "@/lib/budget"
import { formatNOK, formatNumber } from "@/lib/format"
import { cn } from "@/lib/utils"
import { setDragAmount } from "@/lib/dnd"
import { useSalaryProfile } from "@/lib/data/use-budget"
import { saveSalaryProfile, ensureSalaryEntry } from "@/lib/data/salary"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

type Driver = "yearly" | "monthly"

type State = {
  driver: Driver
  yearly: string
  monthlyAfterTax: string
  taxPct: string
  halfTaxPct: string
  vacationRatePct: string
  feriepengerMonth: number
  halfTaxMonth: number
  workdaysPerMonth: string
  vacationDays: string
  deductionDays: string
}

function seed(p: SalaryProfile): State {
  return {
    driver: "yearly",
    yearly: p.yearlySalary ? String(p.yearlySalary) : "",
    monthlyAfterTax: "",
    taxPct: String(p.taxPct),
    halfTaxPct: String(p.halfTaxPct),
    vacationRatePct: String(p.vacationRatePct),
    feriepengerMonth: p.feriepengerMonth,
    halfTaxMonth: p.halfTaxMonth,
    workdaysPerMonth: String(p.workdaysPerMonth),
    vacationDays: String(p.vacationDays),
    deductionDays: String(p.deductionDays),
  }
}

export function SalaryCalculator({ onChanged }: { onChanged: () => void }) {
  const { profile, mutate } = useSalaryProfile()

  const [state, setState] = useState<State>(() =>
    seed(profile ?? defaultSalaryProfile()),
  )
  const [open, setOpen] = useState(false)
  const [advanced, setAdvanced] = useState(false)
  const [saving, setSaving] = useState(false)

  // Re-seed when the saved profile first loads.
  const sig = profile ? "has" : "none"
  const [activeSig, setActiveSig] = useState(sig)
  if (sig !== activeSig) {
    setActiveSig(sig)
    if (profile) setState(seed(profile))
  }

  function set<K extends keyof State>(key: K, value: State[K]) {
    setState((s) => ({ ...s, [key]: value }))
  }

  const taxPct = Number(state.taxPct) || 0
  const yearlySalary =
    state.driver === "yearly"
      ? Number(state.yearly) || 0
      : yearlyFromMonthlyAfterTax(Number(state.monthlyAfterTax) || 0, taxPct)

  const liveProfile: SalaryProfile = {
    yearlySalary,
    taxPct,
    halfTaxPct: Number(state.halfTaxPct) || 0,
    vacationRatePct: Number(state.vacationRatePct) || 0,
    feriepengerMonth: state.feriepengerMonth,
    halfTaxMonth: state.halfTaxMonth,
    workdaysPerMonth: Number(state.workdaysPerMonth) || 26,
    vacationDays: Number(state.vacationDays) || 0,
    deductionDays: Number(state.deductionDays) || 0,
  }
  const r = computeSalary(liveProfile)

  async function onSave() {
    setSaving(true)
    try {
      await saveSalaryProfile(liveProfile)
      await ensureSalaryEntry()
      await mutate()
      onChanged()
      toast.success("Salary saved. The Salary row now auto-fills every month.")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save salary.")
    } finally {
      setSaving(false)
    }
  }

  const chips = [
    { label: "After tax (×10)", value: r.monthlyAfterTax },
    {
      label: `Half tax (${MONTHS_LONG[liveProfile.halfTaxMonth - 1]})`,
      value: r.monthlyAfterHalfTax,
    },
    {
      label: `Feriepenger (${MONTHS_LONG[liveProfile.feriepengerMonth - 1]})`,
      value: r.feriepenger,
    },
  ]

  return (
    <Card>
      <CardHeader>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-center justify-between text-left"
        >
          <div>
            <CardTitle className="flex items-center gap-2">
              <Settings2 className="size-4" />
              Salary calculator
              {profile && profile.yearlySalary > 0 && (
                <Badge variant="secondary" className="font-normal">
                  {formatNOK(profile.yearlySalary)}/yr
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              Auto-fills the Salary row. Drag a result onto any month.
            </CardDescription>
          </div>
          <ChevronDown
            className={cn(
              "text-muted-foreground size-5 transition-transform",
              open && "rotate-180",
            )}
          />
        </button>
      </CardHeader>

      <CardContent className="flex flex-col gap-5">
        <div className="flex flex-wrap gap-2">
          {chips.map((c) => (
            <div
              key={c.label}
              draggable={c.value > 0}
              onDragStart={(e) => setDragAmount(e, c.value)}
              className={cn(
                "flex items-center gap-2 rounded-md border px-3 py-2",
                c.value > 0
                  ? "bg-card cursor-grab active:cursor-grabbing"
                  : "opacity-50",
              )}
              title="Drag onto a month cell"
            >
              <GripVertical className="text-muted-foreground size-4" />
              <div className="leading-tight">
                <div className="text-muted-foreground text-xs">{c.label}</div>
                <div className="font-semibold tabular-nums">
                  {formatNumber(c.value)}
                </div>
              </div>
            </div>
          ))}
        </div>

        {open && (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <div className="flex items-center justify-between">
                  <Label>Enter salary as</Label>
                  <div className="flex rounded-md border p-0.5">
                    {(["yearly", "monthly"] as Driver[]).map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => set("driver", d)}
                        className={cn(
                          "rounded px-2 py-0.5 text-xs",
                          state.driver === d
                            ? "bg-secondary text-secondary-foreground"
                            : "text-muted-foreground",
                        )}
                      >
                        {d === "yearly" ? "Yearly (gross)" : "Monthly (net)"}
                      </button>
                    ))}
                  </div>
                </div>
                {state.driver === "yearly" ? (
                  <Input
                    inputMode="decimal"
                    placeholder="Yearly before tax"
                    value={state.yearly}
                    onChange={(e) => set("yearly", e.target.value)}
                  />
                ) : (
                  <Input
                    inputMode="decimal"
                    placeholder="Monthly after tax"
                    value={state.monthlyAfterTax}
                    onChange={(e) => set("monthlyAfterTax", e.target.value)}
                  />
                )}
                <p className="text-muted-foreground text-xs">
                  Gross/year: {formatNOK(yearlySalary)} · Before tax/mo:{" "}
                  {formatNOK(r.monthlyBeforeTax)}
                </p>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="grid gap-2">
                  <Label htmlFor="tax">Tax %</Label>
                  <Input
                    id="tax"
                    inputMode="decimal"
                    value={state.taxPct}
                    onChange={(e) => set("taxPct", e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="half">Half %</Label>
                  <Input
                    id="half"
                    inputMode="decimal"
                    value={state.halfTaxPct}
                    onChange={(e) => set("halfTaxPct", e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="vac">Ferie %</Label>
                  <Input
                    id="vac"
                    inputMode="decimal"
                    value={state.vacationRatePct}
                    onChange={(e) => set("vacationRatePct", e.target.value)}
                  />
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setAdvanced((a) => !a)}
              className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs"
            >
              <ChevronDown
                className={cn(
                  "size-3 transition-transform",
                  advanced && "rotate-180",
                )}
              />
              Advanced (months &amp; vacation-day constants)
            </button>

            {advanced && (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div className="grid gap-2">
                  <Label>Feriepenger month</Label>
                  <Select
                    value={String(state.feriepengerMonth)}
                    onValueChange={(v) => set("feriepengerMonth", Number(v))}
                  >
                    <SelectTrigger>
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
                <div className="grid gap-2">
                  <Label>Half-tax month</Label>
                  <Select
                    value={String(state.halfTaxMonth)}
                    onValueChange={(v) => set("halfTaxMonth", Number(v))}
                  >
                    <SelectTrigger>
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
                <div className="grid grid-cols-3 gap-2">
                  <div className="grid gap-2">
                    <Label htmlFor="wd" className="text-xs">
                      Work-days
                    </Label>
                    <Input
                      id="wd"
                      inputMode="decimal"
                      value={state.workdaysPerMonth}
                      onChange={(e) => set("workdaysPerMonth", e.target.value)}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="vd" className="text-xs">
                      Vac-days
                    </Label>
                    <Input
                      id="vd"
                      inputMode="decimal"
                      value={state.vacationDays}
                      onChange={(e) => set("vacationDays", e.target.value)}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="dd" className="text-xs">
                      Ded-days
                    </Label>
                    <Input
                      id="dd"
                      inputMode="decimal"
                      value={state.deductionDays}
                      onChange={(e) => set("deductionDays", e.target.value)}
                    />
                  </div>
                </div>
              </div>
            )}

            <div className="text-muted-foreground grid gap-1 rounded-md border p-3 text-sm sm:grid-cols-2">
              <div className="flex justify-between">
                <span>Yearly after tax</span>
                <span className="text-foreground font-medium tabular-nums">
                  {formatNOK(r.yearlyAfterTax)}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Yearly after tax + vacation</span>
                <span className="text-foreground font-medium tabular-nums">
                  {formatNOK(r.yearlyAfterTaxAndVacation)}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Vacation basis</span>
                <span className="tabular-nums">{formatNOK(r.vacationBasis)}</span>
              </div>
              <div className="flex justify-between">
                <span>Feriepenger</span>
                <span className="tabular-nums">{formatNOK(r.feriepenger)}</span>
              </div>
            </div>

            <div className="flex justify-end">
              <Button onClick={onSave} disabled={saving || yearlySalary <= 0}>
                {saving ? "Saving…" : "Save salary"}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
