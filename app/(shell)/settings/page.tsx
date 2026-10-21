"use client"

import { useCategories } from "@/lib/data/use-budget"
import { Skeleton } from "@/components/ui/skeleton"
import { Organize } from "@/components/settings/organize"
import { DateModeToggle } from "@/components/settings/date-mode-toggle"
import { TransfersToggle } from "@/components/settings/transfers-toggle"
import { ThemeToggle } from "@/components/settings/theme-toggle"
import { YearManager } from "@/components/settings/year-manager"
import { DangerZone } from "@/components/settings/danger-zone"

const SECTIONS = [
  { id: "general", label: "General" },
  { id: "years", label: "Years" },
  { id: "categories", label: "Categories & groups" },
  { id: "danger", label: "Danger zone" },
]

function Section({
  id,
  title,
  description,
  children,
}: {
  id: string
  title: string
  description: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section id={id} className="flex scroll-mt-20 flex-col gap-4">
      <div className="flex flex-col gap-1 border-b pb-2">
        <h2 className="text-sm font-semibold tracking-widest uppercase">
          {title}
        </h2>
        <p className="text-muted-foreground text-sm">{description}</p>
      </div>
      {children}
    </section>
  )
}

export default function SettingsPage() {
  const { isLoading: lc } = useCategories()

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <nav className="flex flex-wrap gap-x-4 gap-y-1" aria-label="Sections">
          {SECTIONS.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className="text-muted-foreground hover:text-foreground text-xs font-semibold tracking-wider uppercase"
            >
              {s.label}
            </a>
          ))}
        </nav>
      </div>

      <Section
        id="general"
        title="General"
        description="How the whole site looks and counts your money."
      >
        <div className="grid gap-4 lg:grid-cols-3">
          <ThemeToggle />
          <DateModeToggle />
          <TransfersToggle />
        </div>
      </Section>

      <Section
        id="years"
        title="Years"
        description="Switch, add, copy or delete a year's budget."
      >
        <YearManager />
      </Section>

      <Section
        id="categories"
        title="Categories & groups"
        description={
          <>
            The Organize workspace. Build groups &amp; categories on the left
            (and mark savings / investment groups); categorise every merchant in
            bulk on the right. One category decision covers all of a
            merchant&apos;s past and future charges.
          </>
        }
      >
        {lc ? <Skeleton className="h-40 w-full" /> : <Organize />}
      </Section>

      <div id="danger" className="scroll-mt-20">
        <DangerZone />
      </div>
    </div>
  )
}
