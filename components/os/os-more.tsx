"use client"

import Link from "next/link"
import { useTheme } from "next-themes"
import { CheckCircle2, Download, ExternalLink, LogOut } from "lucide-react"

import { setDateMode, useDateMode, type DateMode } from "@/lib/date-mode"
import { setCountTransfers, useCountTransfers } from "@/lib/count-transfers"
import { cn } from "@/lib/utils"
import { useAuth } from "@/components/auth/auth-provider"
import { Switch } from "@/components/ui/switch"
import { DataThrough } from "@/components/stats/period-numbers"
import { useOs } from "@/components/os/os-shell"
import { useInstall } from "@/components/os/platform"

function Group({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="flex min-w-0 flex-col gap-2">
      <h2 className="text-muted-foreground px-1 text-[11px] font-semibold tracking-widest uppercase">
        {title}
      </h2>
      <div className="bg-card ring-foreground/5 divide-y shadow-sm ring-1">
        {children}
      </div>
    </section>
  )
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
}) {
  return (
    <div
      className="grid border"
      style={{
        gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))`,
      }}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "h-11 text-xs font-semibold tracking-widest uppercase transition-colors",
            value === o.value
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground active:bg-muted",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** Settings, install and the way out to the full website. */
export function OsMore() {
  const { stats } = useOs()
  const { theme, setTheme } = useTheme()
  const dateMode = useDateMode()
  const countTransfers = useCountTransfers()
  const { canInstall, installed, install } = useInstall()
  const { signOut } = useAuth()

  return (
    <div className="mx-auto flex w-full max-w-xl min-w-0 flex-col gap-5">
      <Group title="App">
        <div className="flex flex-col gap-3 p-4">
          {installed ? (
            <p className="flex items-center gap-2 text-sm">
              <CheckCircle2
                className="size-4 text-emerald-600 dark:text-emerald-400"
                aria-hidden
              />
              Running as an installed app
            </p>
          ) : canInstall ? (
            <button
              type="button"
              onClick={() => void install()}
              className="bg-primary text-primary-foreground flex h-12 items-center justify-center gap-2 text-sm font-semibold tracking-widest uppercase"
            >
              <Download className="size-4" aria-hidden /> Install app
            </button>
          ) : (
            <p className="text-muted-foreground text-sm">
              To install: open the browser menu (⋮) and choose{" "}
              <b>Install app</b> or <b>Add to Home screen</b>.
            </p>
          )}
          <DataThrough dataThrough={stats.dataThrough} today={stats.today} />
        </div>
      </Group>

      <Group title="Appearance">
        <div className="p-4">
          <Segmented
            value={(theme ?? "system") as "light" | "dark" | "system"}
            onChange={setTheme}
            options={[
              { value: "light", label: "Light" },
              { value: "dark", label: "Dark" },
              { value: "system", label: "Auto" },
            ]}
          />
        </div>
      </Group>

      <Group title="Numbers">
        <div className="flex flex-col gap-2 p-4">
          <span className="text-sm">Date transactions by</span>
          <Segmented<DateMode>
            value={dateMode}
            onChange={setDateMode}
            options={[
              { value: "bought", label: "Bought" },
              { value: "booked", label: "Booked" },
            ]}
          />
        </div>
        <label className="flex min-h-14 cursor-pointer items-center gap-3 p-4">
          <span className="min-w-0 flex-1">
            <span className="block text-sm">
              Count transfers between own accounts
            </span>
            <span className="text-muted-foreground block text-xs">
              Off: tracked, but not spending or income
            </span>
          </span>
          <Switch
            checked={countTransfers}
            onCheckedChange={setCountTransfers}
            className="after:-inset-x-3 after:-inset-y-3.5"
          />
        </label>
      </Group>

      <Group title="Account">
        <Link
          href="/"
          className="active:bg-muted flex min-h-12 items-center gap-3 px-4 text-sm"
        >
          <ExternalLink className="text-muted-foreground size-4" aria-hidden />
          Open the full website
        </Link>
        <button
          type="button"
          onClick={() => void signOut()}
          className="active:bg-muted flex min-h-12 w-full items-center gap-3 px-4 text-left text-sm text-rose-600 dark:text-rose-400"
        >
          <LogOut className="size-4" aria-hidden />
          Sign out
        </button>
      </Group>
    </div>
  )
}
