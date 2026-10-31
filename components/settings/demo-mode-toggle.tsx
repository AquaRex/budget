"use client"

import { useSWRConfig } from "swr"

import { setDemoMode, useDemoMode } from "@/lib/demo-mode"
import { cn } from "@/lib/utils"
import { Panel } from "@/components/stats/panel"

const OPTIONS: { value: boolean; label: string; hint: string }[] = [
  { value: false, label: "Off", hint: "Your real numbers" },
  {
    value: true,
    label: "Demo mode",
    hint: "Every amount scrambled; saving is off",
  },
]

export function DemoModeToggle() {
  const on = useDemoMode()
  const { mutate } = useSWRConfig()

  function choose(value: boolean) {
    if (value === on) {
      return
    }
    setDemoMode(value)
    void mutate(() => true, undefined, { revalidate: true })
  }

  return (
    <Panel
      title="Demo mode"
      subtitle="Scramble all amounts for showing the site to others"
    >
      <div className="flex flex-col gap-2 sm:flex-row">
        {OPTIONS.map((o) => (
          <button
            key={String(o.value)}
            type="button"
            aria-pressed={on === o.value}
            onClick={() => choose(o.value)}
            className={cn(
              "flex-1 border px-3 py-2 text-left transition-colors",
              on === o.value ? "border-primary bg-muted" : "hover:bg-muted/60",
            )}
          >
            <div className="text-sm font-medium">{o.label}</div>
            <div className="text-muted-foreground text-xs">{o.hint}</div>
          </button>
        ))}
      </div>
    </Panel>
  )
}
