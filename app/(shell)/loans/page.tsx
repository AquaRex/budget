"use client"

import { useMemo, useState } from "react"
import { Plus } from "lucide-react"
import { toast } from "sonner"

import { errMessage } from "@/lib/errors"
import {
  deleteLoan,
  setLoanInOverview,
  useLoans,
  type Loan,
} from "@/lib/data/loans"
import { loanPayments, projectLoan } from "@/lib/loans/compute"
import { monthIndexOf } from "@/lib/savings/compute"
import { buildTypeMap } from "@/lib/spending"
import {
  useCategories,
  useTransactions,
  useTypeCategories,
} from "@/lib/data/use-budget"
import { useToday } from "@/lib/stats/use-dashboard-stats"
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
import { LoanCard } from "@/components/loans/loan-card"
import { LoansSummary } from "@/components/loans/loans-summary"
import { LoanDialog } from "@/components/loans/loan-dialog"

export default function LoansPage() {
  const today = useToday()
  const thisYear = Number(today.slice(0, 4))
  const thisMonth = Number(today.slice(5, 7))
  const todayIndex = monthIndexOf(thisYear, thisMonth)
  const { loans, error, isLoading, mutate } = useLoans()
  const { categories, isLoading: categoriesLoading } = useCategories()
  const { transactions, isLoading: transactionsLoading } = useTransactions()
  const { typeCategories, isLoading: typesLoading } = useTypeCategories()
  const [editing, setEditing] = useState<Loan | null>(null)
  const [adding, setAdding] = useState(false)
  const [removing, setRemoving] = useState<Loan | null>(null)

  const typeMap = useMemo(() => buildTypeMap(typeCategories), [typeCategories])
  const projections = useMemo(
    () =>
      new Map(
        loans.map((l) => [
          l.id,
          projectLoan(
            l,
            loanPayments(l, transactions, categories, typeMap),
            todayIndex,
          ),
        ]),
      ),
    [loans, transactions, categories, typeMap, todayIndex],
  )
  const loading =
    isLoading || categoriesLoading || transactionsLoading || typesLoading

  async function toggleOverview(l: Loan, inOverview: boolean) {
    try {
      await setLoanInOverview(l.id, inOverview)
      mutate()
    } catch (e) {
      toast.error(errMessage(e, "Could not update the loan."))
    }
  }

  async function remove(l: Loan) {
    try {
      await deleteLoan(l.id)
      mutate()
    } catch (e) {
      toast.error(errMessage(e, "Could not delete the loan."))
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-0.5">
        <h1 className="text-2xl font-semibold tracking-tight">Debt</h1>
        <p className="text-muted-foreground text-sm">
          What you owe, when it&apos;s paid off and how much goes to interest —
          from the payments in each loan&apos;s category.
        </p>
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Debt needs a database update</AlertTitle>
          <AlertDescription>
            Run <code>supabase/migrations/0022_loans.sql</code> in the Supabase
            SQL Editor, then reload this page. ({errMessage(error, "")})
          </AlertDescription>
        </Alert>
      ) : loading ? (
        <Skeleton className="h-96" />
      ) : (
        <>
          {loans.some((l) => !("in_overview" in l)) && (
            <Alert variant="destructive">
              <AlertTitle>Debt needs a database update</AlertTitle>
              <AlertDescription>
                Run <code>supabase/migrations/0024_loan_overview.sql</code> in
                the Supabase SQL Editor, then reload this page.
              </AlertDescription>
            </Alert>
          )}
          {loans.length > 0 && (
            <LoansSummary
              items={loans.map((l) => ({
                loan: l,
                projection: projections.get(l.id)!,
              }))}
              todayIndex={todayIndex}
              onToggle={toggleOverview}
            />
          )}
          <div className="flex justify-end">
            <Button onClick={() => setAdding(true)}>
              <Plus className="size-4" /> Add loan
            </Button>
          </div>
          {loans.length === 0 ? (
            <p className="text-muted-foreground border px-4 py-10 text-center text-sm">
              No loans yet. Add one with what you owe, the interest rate and the
              category its payments go in.
            </p>
          ) : (
            loans.map((l) => (
              <LoanCard
                key={l.id}
                loan={l}
                categoryName={
                  categories.find((c) => c.id === l.category_id)?.name ?? null
                }
                projection={projections.get(l.id)!}
                todayIndex={todayIndex}
                onEdit={() => setEditing(l)}
                onDelete={() => setRemoving(l)}
              />
            ))
          )}
        </>
      )}

      <LoanDialog
        open={adding || !!editing}
        loan={editing}
        nextSortOrder={loans.length}
        thisYear={thisYear}
        thisMonth={thisMonth}
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
              Only the loan is removed — its category and transactions stay as
              they are.
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
