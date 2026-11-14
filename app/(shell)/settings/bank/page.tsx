"use client"

import { BankCompare } from "@/components/bank/bank-compare"
import { BankConnection } from "@/components/bank/bank-connection"
import { BankFetchHistory, BankRawData } from "@/components/bank/bank-raw-data"
import { BankUpdateButton } from "@/components/bank/bank-update-button"
import { BANK_DAILY_LIMIT } from "@/lib/bank"
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
          description={`Pull new data from the bank — only when you click, max ${BANK_DAILY_LIMIT} per day. Click a row for the full details.`}
        >
          <BankUpdateButton />
          <BankFetchHistory />
        </Section>

        <Section
          title="Compare with your transactions"
          description="Read-only check of how the bank data lines up with what you've imported from CSV. Nothing is imported or changed."
        >
          <BankCompare />
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
