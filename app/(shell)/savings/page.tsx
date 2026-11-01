"use client"

import { useYear } from "@/lib/year"
import { useSavingsModel } from "@/lib/savings/use-savings-model"
import { Skeleton } from "@/components/ui/skeleton"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { SavingsOverview } from "@/components/savings/savings-overview"
import { SavingsGrid } from "@/components/savings/savings-grid"
import { PlanSchedule } from "@/components/savings/plan-schedule"
import { SavingsTabs } from "@/components/savings/savings-tabs"

export default function SavingsPage() {
  const year = useYear()
  const model = useSavingsModel()

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-0.5">
        <h1 className="text-2xl font-semibold tracking-tight">Savings</h1>
        <p className="text-muted-foreground text-sm">
          Funds, stocks and your employee share plan — what you put in, what
          it&apos;s worth, and when bonus shares unlock.
        </p>
      </div>
      <SavingsTabs />

      {model.error ? (
        <Alert variant="destructive">
          <AlertTitle>Savings needs a database update</AlertTitle>
          <AlertDescription>
            Run <code>supabase/migrations/0017_savings.sql</code> and{" "}
            <code>0018_holding_symbols.sql</code> in the Supabase SQL Editor,
            then reload this page. ({model.error.message})
          </AlertDescription>
        </Alert>
      ) : model.isLoading ? (
        <div className="flex flex-col gap-4">
          <Skeleton className="h-96" />
          <Skeleton className="h-64" />
        </div>
      ) : (
        <>
          {model.marketError && (
            <Alert variant="destructive">
              <AlertTitle>Market prices couldn&apos;t load</AlertTitle>
              <AlertDescription>
                Linked holdings need the <code>quotes</code> Edge Function
                deployed in Supabase (code in{" "}
                <code>supabase/functions/quotes/index.ts</code>). Values below
                use the prices you entered and your purchase prices. (
                {model.marketError.message})
              </AlertDescription>
            </Alert>
          )}
          {model.holdings.length > 0 && <SavingsOverview model={model} />}
          {model.results
            .filter((r) => r.holding.kind === "plan")
            .map((r) => (
              <PlanSchedule
                key={r.holding.id}
                result={r}
                todayIndex={model.todayIndex}
              />
            ))}
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold tracking-widest uppercase">
              Month by month · {year}
            </h2>
            <SavingsGrid model={model} year={year} />
          </section>
        </>
      )}
    </div>
  )
}
