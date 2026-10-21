"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useTheme } from "next-themes"
import {
  ArrowRight,
  LayoutDashboard,
  Layers,
  Moon,
  Receipt,
  Settings,
  Smartphone,
  Sun,
  Wallet,
  LogOut,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { useAuth } from "@/components/auth/auth-provider"
import { Button } from "@/components/ui/button"
import { YearSelector } from "@/components/year-selector"

const nav = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/budget", label: "Budget", icon: Receipt },
  { href: "/spending", label: "Spending", icon: Wallet },
  { href: "/groups", label: "Groups", icon: Layers },
  { href: "/settings", label: "Settings", icon: Settings },
]

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { signOut } = useAuth()
  const { resolvedTheme, setTheme } = useTheme()

  // Normalize trailing slashes (trailingSlash: true) for active matching.
  const path = pathname?.replace(/\/+$/, "") || "/"

  return (
    <div className="min-h-svh">
      <header className="bg-background/80 sticky top-0 z-20 border-b backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-7xl items-center gap-2 px-4 sm:gap-4 sm:px-6 2xl:max-w-[1600px]">
          <Link
            href="/"
            className="flex shrink-0 items-center gap-2"
            aria-label="Budget"
          >
            <span className="bg-primary size-3" />
            <span className="hidden text-xs font-semibold tracking-widest uppercase md:inline">
              Budget
            </span>
          </Link>
          <nav className="flex h-full shrink-0 items-center">
            {nav.map(({ href, label, icon: Icon }) => {
              const active = path === href
              return (
                <Link
                  key={href}
                  href={href}
                  aria-label={label}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex h-full items-center gap-2 border-b-2 px-2 text-xs font-semibold tracking-wider uppercase transition-colors sm:px-3",
                    active
                      ? "border-primary text-foreground"
                      : "text-muted-foreground hover:text-foreground border-transparent",
                  )}
                >
                  <Icon className="size-4" />
                  <span className="hidden lg:inline">{label}</span>
                </Link>
              )
            })}
          </nav>
          <div className="ml-auto flex min-w-0 items-center gap-1">
            {/* Many years scroll inside the header instead of widening the page. */}
            <div className="min-w-0 overflow-x-auto [scrollbar-width:none]">
              <YearSelector />
            </div>
            <div className="bg-border mx-1 hidden h-5 w-px sm:block" />
            <Button
              variant="ghost"
              size="icon"
              className="hidden sm:inline-flex"
              title="Open the phone app"
              asChild
            >
              <Link href="/os" aria-label="Open the phone app">
                <Smartphone className="size-4" />
              </Link>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="hidden sm:inline-flex"
              aria-label="Toggle theme"
              onClick={() =>
                setTheme(resolvedTheme === "dark" ? "light" : "dark")
              }
            >
              <Sun className="size-4 dark:hidden" />
              <Moon className="hidden size-4 dark:block" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Sign out"
              onClick={signOut}
            >
              <LogOut className="size-4" />
            </Button>
          </div>
        </div>
      </header>
      {/* Phones get the dedicated app; the full site stays one tap away. */}
      <Link
        href="/os"
        className="bg-primary/10 hover:bg-primary/15 flex items-center justify-between gap-3 border-b px-4 py-2.5 text-xs font-semibold tracking-wider uppercase transition-colors sm:hidden"
      >
        <span className="flex items-center gap-2">
          <Smartphone className="size-4" />
          Open app
        </span>
        <span className="text-muted-foreground flex items-center gap-1 font-normal tracking-normal normal-case">
          Made for your phone
          <ArrowRight className="size-3.5" />
        </span>
      </Link>
      <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 2xl:max-w-[1600px]">
        {children}
      </main>
    </div>
  )
}
