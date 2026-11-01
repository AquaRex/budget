"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import { cn } from "@/lib/utils"

const TABS = [
  { href: "/savings", label: "Holdings" },
  { href: "/savings/goals", label: "Goals" },
]

export function SavingsTabs() {
  const path = usePathname()?.replace(/\/+$/, "") || "/"
  return (
    <nav className="flex gap-1 border-b" aria-label="Savings">
      {TABS.map((t) => {
        const active = path === t.href
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "border-primary text-foreground"
                : "text-muted-foreground hover:text-foreground border-transparent",
            )}
          >
            {t.label}
          </Link>
        )
      })}
    </nav>
  )
}
