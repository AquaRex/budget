"use client"

import { useTransactions, useTxRules } from "@/lib/data/use-budget"
import { RulesManager } from "@/components/settings/rules-manager"
import { Section, SettingsLayout } from "@/components/settings/settings-layout"

export default function RulesSettingsPage() {
  const { mutate: mutateTx } = useTransactions()
  const { mutate: mutateRules } = useTxRules()

  return (
    <SettingsLayout>
      <Section
        title="Rules"
        description="Which category a transaction gets automatically, now and on future imports."
      >
        <RulesManager
          onChanged={() => {
            mutateTx()
            mutateRules()
          }}
        />
      </Section>
    </SettingsLayout>
  )
}
