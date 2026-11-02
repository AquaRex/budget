"use client"

import { useCategories } from "@/lib/data/use-budget"
import { Skeleton } from "@/components/ui/skeleton"
import { Organize } from "@/components/settings/organize"
import { Section, SettingsLayout } from "@/components/settings/settings-layout"

export default function CategoriesSettingsPage() {
  const { isLoading } = useCategories()

  return (
    <SettingsLayout>
      <Section
        title="Categories & groups"
        description={
          <>
            Groups hold categories; Groups, the dashboard and the budget all
            count by group. Rename, reorder, merge or delete here, mark savings
            groups, sort what&apos;s in Needs sorting, and categorise merchants
            — one decision covers a merchant&apos;s past and future charges.
          </>
        }
      >
        {isLoading ? <Skeleton className="h-40 w-full" /> : <Organize />}
      </Section>
    </SettingsLayout>
  )
}
