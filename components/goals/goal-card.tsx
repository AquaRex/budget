"use client"

import Link from "next/link"
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Pencil,
  Trash2,
  XCircle,
} from "lucide-react"

import type { Goal } from "@/lib/data/goals"
import type { GoalProjection, GoalVerdict } from "@/lib/goals/compute"
import { cn } from "@/lib/utils"
import { Panel } from "@/components/stats/panel"
import { kr } from "@/components/stats/display"
import { monthLabel } from "@/components/savings/format"
import { GoalChart } from "@/components/goals/goal-chart"
import { GoalBreakdown } from "@/components/goals/goal-breakdown"

const VERDICT: Record<
  GoalVerdict,
  { label: string; icon: typeof CheckCircle2; tone: string }
> = {
  reached: {
    label: "Reached",
    icon: CheckCircle2,
    tone: "text-emerald-700 dark:text-emerald-400",
  },
  "on-track": {
    label: "On track",
    icon: CheckCircle2,
    tone: "text-emerald-700 dark:text-emerald-400",
  },
  overspending: {
    label: "Behind — spending over budget",
    icon: AlertTriangle,
    tone: "text-amber-700 dark:text-amber-400",
  },
  "budget-short": {
    label: "Budget falls short",
    icon: XCircle,
    tone: "text-rose-700 dark:text-rose-400",
  },
  past: {
    label: "Goal month has passed",
    icon: Clock,
    tone: "text-muted-foreground",
  },
}

const perMonth = (n: number) => `${kr(Math.round(n))}/mo`
const reachLabel = (i: number | null) =>
  i === null ? "not within 50 years" : monthLabel(i)
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`

export function GoalCard({
  goal,
  projection: p,
  budgetYear,
  onEdit,
  onDelete,
}: {
  goal: Goal
  projection: GoalProjection
  budgetYear: number
  onEdit: () => void
  onDelete: () => void
}) {
  const v = VERDICT[p.verdict]
  const Icon = v.icon
  const share = Math.min(1, p.now / p.target)
  const need = p.needPerMonth ?? 0

  return (
    <Panel
      title={goal.name}
      subtitle={`${kr(p.target)} by the end of ${monthLabel(p.deadline)}`}
      action={
        <div className="flex items-center">
          <button
            type="button"
            aria-label={`Edit ${goal.name}`}
            onClick={onEdit}
            className="text-muted-foreground hover:text-foreground p-1.5"
          >
            <Pencil className="size-4" />
          </button>
          <button
            type="button"
            aria-label={`Delete ${goal.name}`}
            onClick={onDelete}
            className="text-muted-foreground hover:text-destructive p-1.5"
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <div
            className={cn(
              "flex items-center gap-1.5 text-sm font-semibold",
              v.tone,
            )}
          >
            <Icon className="size-4" aria-hidden /> {v.label}
          </div>
          <div className="bg-muted h-2 w-full">
            <div
              className="h-full bg-(--viz-income)"
              style={{ width: `${share * 100}%` }}
            />
          </div>
          <p className="text-muted-foreground text-xs tabular-nums">
            {kr(p.now)} of {kr(p.target)} today ({Math.round(share * 100)}%)
            {p.monthsLeft > 0 && ` · ${plural(p.monthsLeft, "month")} left`}
          </p>
        </div>

        {p.verdict !== "reached" && p.verdict !== "past" && (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Figure
                label="Needed"
                value={perMonth(need)}
                hint={`to reach it in ${monthLabel(p.deadline)}`}
              />
              <Figure
                label="On budget"
                value={perMonth(p.budgetPerMonth)}
                hint={`reaches it ${reachLabel(p.reachBudget)}`}
                bad={p.budgetPerMonth < need}
              />
              <Figure
                label="At your actual pace"
                value={perMonth(p.actualPerMonth)}
                hint={`reaches it ${reachLabel(p.reachActual)}`}
                bad={p.actualPerMonth < need}
              />
            </div>
            <GoalChart projection={p} />
            <Advice p={p} need={need} />
            <GoalBreakdown p={p} />
          </>
        )}
        {p.verdict === "past" && (
          <p className="text-sm">
            Edit the goal to set a new month, or delete it.
          </p>
        )}

        <p className="text-muted-foreground text-xs">
          “On budget” uses your {budgetYear} budget month by month (repeated for
          later years): income minus bills, with money budgeted into savings
          groups counting towards the goal. “Actual pace” adjusts it by how your
          last{" "}
          {p.gapMonths
            ? plural(p.gapMonths, "complete month")
            : "complete months"}{" "}
          compared with the budget. Growth on investments isn&apos;t assumed.
        </p>
      </div>
    </Panel>
  )
}

function Figure({
  label,
  value,
  hint,
  bad,
}: {
  label: string
  value: string
  hint: string
  bad?: boolean
}) {
  return (
    <div className="flex flex-col gap-0.5 border px-3 py-2">
      <span className="text-muted-foreground text-[11px] font-semibold tracking-widest uppercase">
        {label}
      </span>
      <span className="text-lg font-semibold tabular-nums">{value}</span>
      <span
        className={cn(
          "text-xs",
          bad ? "text-rose-700 dark:text-rose-400" : "text-muted-foreground",
        )}
      >
        {hint}
      </span>
    </div>
  )
}

function Advice({ p, need }: { p: GoalProjection; need: number }) {
  const gap = Math.round(p.gapPerMonth)
  const overspend =
    p.gapMonths > 0 && gap > 0
      ? `Over the last ${plural(p.gapMonths, "complete month")} you've ended up ${perMonth(gap)} behind your budget.`
      : p.gapMonths > 0 && gap < 0
        ? `Over the last ${plural(p.gapMonths, "complete month")} you've done ${perMonth(-gap)} better than your budget.`
        : p.gapMonths === 0
          ? "There are no complete months with a budget yet, so the actual pace equals the budget."
          : null

  return (
    <div className="bg-muted/50 flex flex-col gap-3 border p-3 text-sm">
      {p.verdict === "on-track" && (
        <p>
          You&apos;re on course: at your actual pace you reach it in{" "}
          {reachLabel(p.reachActual)}
          {p.reachActual !== null &&
            p.reachActual < p.deadline &&
            `, ${plural(p.deadline - p.reachActual, "month")} early`}
          . You have about {perMonth(p.actualPerMonth - need)} of room before
          the goal slips. {overspend}
        </p>
      )}
      {p.verdict === "overspending" && (
        <p>
          Your budget gets you there in {reachLabel(p.reachBudget)}, so the
          budget is fine — the spending isn&apos;t. {overspend} Bring it back to
          at least {perMonth(need)} saved (
          <span className="font-semibold">
            {perMonth(need - p.actualPerMonth)} less spending
          </span>
          ) and you reach the goal on time.
        </p>
      )}
      {p.verdict === "budget-short" && (
        <p>
          Even on budget you&apos;d reach it in {reachLabel(p.reachBudget)}
          {p.reachBudget !== null &&
            `, ${plural(p.reachBudget - p.deadline, "month")} late`}
          . The budget needs{" "}
          <span className="font-semibold">
            {perMonth(need - p.budgetPerMonth)} more
          </span>{" "}
          — raise budgeted income or cut budgeted bills by that much — or move
          the goal later. {overspend}
        </p>
      )}

      {(p.overBudget.length > 0 || p.incomeShortPerMonth >= 1) &&
        p.verdict !== "on-track" && (
          <p>
            Biggest drains this year:{" "}
            {[
              ...(p.incomeShortPerMonth >= 1
                ? [`income below budget (${perMonth(p.incomeShortPerMonth)})`]
                : []),
              ...p.overBudget
                .slice(0, 3)
                .map((g) => `${g.name} (+${perMonth(g.perMonth)})`),
            ].join(", ")}
            .{" "}
            <Link href="/budget" className="text-primary hover:underline">
              Adjust the budget →
            </Link>
          </p>
        )}
    </div>
  )
}
