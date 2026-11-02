import { SubTabs } from "@/components/sub-tabs"

const TABS = [
  { href: "/settings", label: "General" },
  { href: "/settings/categories", label: "Categories" },
  { href: "/settings/rules", label: "Rules" },
]

/** The Settings heading and its sub-tabs, above one tab's content. */
export function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      <SubTabs tabs={TABS} />
      {children}
    </div>
  )
}

export function Section({
  title,
  description,
  children,
}: {
  title: string
  description: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-4">
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
