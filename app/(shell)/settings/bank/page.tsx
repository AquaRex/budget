"use client"

import { BankConnection } from "@/components/bank/bank-connection"
import { BankFetchHistory } from "@/components/bank/bank-history"
import { BankHeld, BankHistoryCheck } from "@/components/bank/bank-review"
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
          description={`New transactions are fetched automatically every morning. The button gets them right away — up to ${BANK_DAILY_LIMIT} times a day. Only transactions not already in your list are added.`}
        >
          <BankUpdateButton />
          <BankFetchHistory />
        </Section>

        <Section
          title="Waiting for review"
          description="Bank transactions that weren't added automatically because a very similar one is already in your list nearby."
        >
          <BankHeld />
        </Section>

        <Section
          title="History check"
          description="Compares your list with the bank's own records, for information. Read-only — it never changes or removes anything."
        >
          <BankHistoryCheck />
        </Section>
      </div>
    </SettingsLayout>
  )
}
