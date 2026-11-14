"use client"

import { BankConnection } from "@/components/bank/bank-connection"
import { BankFetchHistory, BankRawData } from "@/components/bank/bank-raw-data"
import { Section, SettingsLayout } from "@/components/settings/settings-layout"

export default function BankSettingsPage() {
  return (
    <SettingsLayout>
      <div className="flex flex-col gap-10">
        <Section
          title="Bank connection"
          description="Read-only access to your bank accounts through Enable Banking (PSD2). You approve it with BankID; consent lasts up to 180 days."
        >
          <BankConnection />
        </Section>

        <Section
          title="Updates"
          description="Every time the Update button at the top was used (max 2 per day). Click a row for the full details."
        >
          <BankFetchHistory />
        </Section>

        <Section
          title="Raw data (staging)"
          description="Exactly what the bank sent, stored separately. Nothing here is added to your Transactions yet — this is for inspecting the data first. Click a row to see the raw JSON."
        >
          <BankRawData />
        </Section>
      </div>
    </SettingsLayout>
  )
}
