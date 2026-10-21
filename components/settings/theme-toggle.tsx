"use client"

import { useTheme } from "next-themes"

import { cn } from "@/lib/utils"
import { Panel } from "@/components/stats/panel"

const OPTIONS = [
  { value: "light", label: "Light", hint: "Always light" },
  { value: "dark", label: "Dark", hint: "Always dark" },
  { value: "system", label: "System", hint: "Follow this device" },
]

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  return (
    <Panel title="Theme" subtitle="Press D anywhere to flip light / dark">
      <div className="flex flex-col gap-2 sm:flex-row">
        {OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            aria-pressed={theme === o.value}
            onClick={() => setTheme(o.value)}
            className={cn(
              "flex-1 border px-3 py-2 text-left transition-colors",
              theme === o.value ? "border-primary bg-muted" : "hover:bg-muted/60",
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
