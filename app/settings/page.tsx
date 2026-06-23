"use client"

import { useCategories } from "@/lib/data/use-budget"
import { Skeleton } from "@/components/ui/skeleton"
import { Organize } from "@/components/settings/organize"
import { DateModeToggle } from "@/components/settings/date-mode-toggle"
import { YearManager } from "@/components/settings/year-manager"
import { DangerZone } from "@/components/settings/danger-zone"

export default function SettingsPage() {
  const { isLoading: lc } = useCategories()

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>

      <YearManager />

      <DateModeToggle />

      {lc ? <Skeleton className="h-40 w-full" /> : <Organize />}

      <DangerZone />
    </div>
  )
}
