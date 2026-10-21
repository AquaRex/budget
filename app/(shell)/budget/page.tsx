"use client"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { EntriesGrid } from "@/components/entries/entries-grid"
import { BudgetSummary } from "@/components/entries/budget-summary"

export default function BudgetPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-0.5">
        <h1 className="text-2xl font-semibold tracking-tight">Budget</h1>
        <p className="text-muted-foreground text-sm">
          Your expected bills and income, month by month. Amounts in NOK.
        </p>
      </div>

      <BudgetSummary />

      <Tabs defaultValue="bills" className="gap-4">
        <TabsList>
          <TabsTrigger value="bills">Bills</TabsTrigger>
          <TabsTrigger value="income">Income &amp; salary</TabsTrigger>
        </TabsList>
        <TabsContent value="bills">
          <EntriesGrid kind="bill" embedded />
        </TabsContent>
        <TabsContent value="income">
          <EntriesGrid kind="income" embedded />
        </TabsContent>
      </Tabs>
    </div>
  )
}
