"use client"

import { useSWRConfig } from "swr"

import { setDemoMode, useDemoMode, type DemoMode } from "@/lib/demo-mode"
import { cn } from "@/lib/utils"
import { Panel } from "@/components/stats/panel"

const OPTIONS: { value: DemoMode; label: string; hint: string }[] = [
  { value: "off", label: "Off", hint: "Your real numbers" },
  {
    value: "scramble",
    label: "Scrambled",
    hint: "Believable fake amounts; saving is off",
  },
  {
    value: "mask",
    label: "Hidden",
    hint: "Every amount shown as *****; saving is off",
  },
]

export function DemoModeToggle() {
  const mode = useDemoMode()
  const { mutate } = useSWRConfig()

  function choose(value: DemoMode) {
    if (value === mode) {
      return
    }
    setDemoMode(value)
    // Scrambling happens as data loads, so entering or leaving it refetches.
    if (value === "scramble" || mode === "scramble") {
      void mutate(() => true, undefined, { revalidate: true })
    }
  }

  return (
    <Panel
      title="Demo mode"
      subtitle="Disguise all amounts for showing the site to others"
    >
      <div className="flex flex-col gap-2 sm:flex-row">
        {OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            aria-pressed={mode === o.value}
            onClick={() => choose(o.value)}
            className={cn(
              "flex-1 border px-3 py-2 text-left transition-colors",
              mode === o.value
                ? "border-primary bg-muted"
                : "hover:bg-muted/60",
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
