"use client"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { EntriesGrid } from "@/components/entries/entries-grid"

export default function BudgetPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Budget</h1>

      <Tabs defaultValue="bills" className="gap-6">
        <TabsList>
          <TabsTrigger value="bills">Bills</TabsTrigger>
          <TabsTrigger value="income">Income</TabsTrigger>
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
