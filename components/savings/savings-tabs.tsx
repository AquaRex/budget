import { SubTabs } from "@/components/sub-tabs"

const TABS = [
  { href: "/savings", label: "Holdings" },
  { href: "/savings/goals", label: "Goals" },
]

export function SavingsTabs() {
  return <SubTabs tabs={TABS} />
}
