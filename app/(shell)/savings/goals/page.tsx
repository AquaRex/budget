"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { Plus } from "lucide-react"
import { toast } from "sonner"

import { errMessage } from "@/lib/errors"
import { deleteGoal, useGoals, type Goal } from "@/lib/data/goals"
import { hasBudget, projectGoal } from "@/lib/goals/compute"
import { computeDashboardStats } from "@/lib/stats/compute"
import { useStatsData, useToday } from "@/lib/stats/use-dashboard-stats"
import { useSavingsModel } from "@/lib/savings/use-savings-model"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
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
import { GoalCard } from "@/components/goals/goal-card"
import { GoalDialog } from "@/components/goals/goal-dialog"
import { SavingsTabs } from "@/components/savings/savings-tabs"

export default function GoalsPage() {
  const today = useToday()
  const thisYear = Number(today.slice(0, 4))
  const thisMonth = Number(today.slice(5, 7))
  // Goals always project from today, whatever year the switcher shows.
  const current = useStatsData(thisYear)
  const previous = useStatsData(thisYear - 1)
  const model = useSavingsModel()
  const { goals, error, isLoading, mutate } = useGoals()
  const [editing, setEditing] = useState<Goal | null>(null)
  const [adding, setAdding] = useState(false)
  const [removing, setRemoving] = useState<Goal | null>(null)

  const stats = useMemo(
    () =>
      computeDashboardStats(
        current.data,
        {
          year: thisYear,
          month: thisMonth,
          scope: "year",
          includeIncomplete: false,
        },
        new Date(`${today}T00:00`),
      ),
    [current.data, thisYear, thisMonth, today],
  )
  const prevStats = useMemo(
    () =>
      computeDashboardStats(
        previous.data,
        {
          year: thisYear - 1,
          month: 12,
          scope: "year",
          includeIncomplete: false,
        },
        new Date(`${today}T00:00`),
      ),
    [previous.data, thisYear, today],
  )
  const holdingsValue =
    model.series.find((p) => p.monthIndex === model.todayIndex)?.value ?? 0
  const holdings = model.results.map((r) => ({
    value: r.value,
    returnPct: r.holding.expected_return_pct,
  }))

  const loading =
    current.loading || previous.loading || model.isLoading || isLoading

  async function remove(g: Goal) {
    try {
      await deleteGoal(g.id)
      mutate()
    } catch (e) {
      toast.error(errMessage(e, "Could not delete the goal."))
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <SavingsTabs />
      <div className="flex flex-col gap-0.5">
        <h1 className="text-2xl font-semibold tracking-tight">Goals</h1>
        <p className="text-muted-foreground text-sm">
          Set an amount to reach by a certain month, and see when your budget —
          and your actual spending — gets you there.
        </p>
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Goals needs a database update</AlertTitle>
          <AlertDescription>
            Run <code>supabase/migrations/0020_goals.sql</code> in the Supabase
            SQL Editor, then reload this page. ({error.message})
          </AlertDescription>
        </Alert>
      ) : loading ? (
        <div className="flex flex-col gap-4">
          <Skeleton className="h-96" />
        </div>
      ) : (
        <>
          {!hasBudget(stats.months) && (
            <Alert>
              <AlertTitle>No {thisYear} budget yet</AlertTitle>
              <AlertDescription>
                Goals are projected from this year&apos;s budgeted income and
                bills.{" "}
                <Link href="/budget" className="underline">
                  Set up the {thisYear} budget
                </Link>{" "}
                to see when you&apos;ll reach them.
              </AlertDescription>
            </Alert>
          )}
          <div className="flex justify-end">
            <Button onClick={() => setAdding(true)}>
              <Plus className="size-4" /> Add goal
            </Button>
          </div>
          {goals.length === 0 ? (
            <p className="text-muted-foreground border px-4 py-10 text-center text-sm">
              No goals yet. Add one — e.g. 500 000 kr for a house deposit by
              December {thisYear + 3}.
            </p>
          ) : (
            hasBudget(stats.months) &&
            goals.map((g) => (
              <GoalCard
                key={g.id}
                goal={g}
                budgetYear={thisYear}
                projection={projectGoal({
                  goal: g,
                  holdings,
                  todayIndex: model.todayIndex,
                  months: stats.months,
                  prevMonths: prevStats.months,
                  categories: stats.categories,
                  summary: stats.summary,
                })}
                onEdit={() => setEditing(g)}
                onDelete={() => setRemoving(g)}
              />
            ))
          )}
        </>
      )}

      <GoalDialog
        open={adding || !!editing}
        goal={editing}
        nextSortOrder={goals.length}
        holdingsValue={holdingsValue}
        thisYear={thisYear}
        onClose={() => {
          setAdding(false)
          setEditing(null)
        }}
        onSaved={mutate}
      />
      <AlertDialog
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {removing?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Only the goal is removed — your budget, transactions and holdings
              stay as they are.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (removing) {
                  void remove(removing)
                }
                setRemoving(null)
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
