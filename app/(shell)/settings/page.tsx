"use client"

import { DemoModeToggle } from "@/components/settings/demo-mode-toggle"
import { DateModeToggle } from "@/components/settings/date-mode-toggle"
import { TransfersToggle } from "@/components/settings/transfers-toggle"
import { ThemeToggle } from "@/components/settings/theme-toggle"
import { YearManager } from "@/components/settings/year-manager"
import { DangerZone } from "@/components/settings/danger-zone"
import { Section, SettingsLayout } from "@/components/settings/settings-layout"

export default function SettingsPage() {
  return (
    <SettingsLayout>
      <div className="flex flex-col gap-10">
        <Section
          title="General"
          description="How the whole site looks and counts your money."
        >
          <div className="grid gap-4 lg:grid-cols-2">
            <ThemeToggle />
            <DateModeToggle />
            <TransfersToggle />
            <DemoModeToggle />
          </div>
        </Section>

        <Section
          title="Years"
          description="Switch, add, copy or delete a year's budget."
        >
          <YearManager />
        </Section>

        <DangerZone />
      </div>
    </SettingsLayout>
  )
}
