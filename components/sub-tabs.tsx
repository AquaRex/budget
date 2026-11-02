"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import { cn } from "@/lib/utils"

/** A row of page tabs, one route each; the current route is underlined. */
export function SubTabs({ tabs }: { tabs: { href: string; label: string }[] }) {
  const path = usePathname()?.replace(/\/+$/, "") || "/"
  return (
    <nav className="flex border-b">
      {tabs.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          aria-current={path === t.href ? "page" : undefined}
          className={cn(
            "-mb-px border-b-2 px-3 py-2 text-xs font-semibold tracking-wider uppercase transition-colors",
            path === t.href
              ? "border-primary text-foreground"
              : "text-muted-foreground hover:text-foreground border-transparent",
          )}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  )
}
