"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useTheme } from "next-themes"
import {
  LayoutDashboard,
  Layers,
  Moon,
  PiggyBank,
  Receipt,
  Settings,
  Smartphone,
  Sun,
  Landmark,
  ArrowRightLeft,
  LogOut,
} from "lucide-react"

import { useDemoMode } from "@/lib/demo-mode"
import { cn } from "@/lib/utils"
import { useAuth } from "@/components/auth/auth-provider"
import { Button } from "@/components/ui/button"
import { YearSelector } from "@/components/year-selector"
import { useBankAutoImport } from "@/components/bank/use-bank-auto-import"

const nav = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/budget", label: "Budget", icon: Receipt },
  {
    href: "/transactions",
    label: "Transactions",
    short: "Activity", // fits the phone tab bar
    icon: ArrowRightLeft,
  },
  { href: "/groups", label: "Groups", icon: Layers },
  { href: "/savings", label: "Savings", icon: PiggyBank },
  { href: "/loans", label: "Debt", icon: Landmark },
  { href: "/settings", label: "Settings", icon: Settings },
]

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { signOut } = useAuth()
  const { resolvedTheme, setTheme } = useTheme()
  const demo = useDemoMode()
  useBankAutoImport()

  // Normalize trailing slashes (trailingSlash: true) for active matching.
  const path = pathname?.replace(/\/+$/, "") || "/"

  return (
    <div className="min-h-svh">
      {/* Top padding = the phone's status bar when installed on the home screen. */}
      <header className="bg-background/80 sticky top-0 z-20 border-b pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-7xl items-center gap-2 px-4 sm:gap-4 sm:px-6 2xl:max-w-[1600px]">
          <Link
            href="/"
            className="flex shrink-0 items-center gap-2"
            aria-label="Budget"
          >
            <span className="bg-primary size-3" />
            <span className="text-xs font-semibold tracking-widest uppercase sm:hidden md:inline">
              Budget
            </span>
          </Link>
          {/* Phones get the bottom tab bar instead (below). */}
          <nav className="hidden h-full shrink-0 items-center sm:flex">
            {nav.map(({ href, label, icon: Icon }) => {
              const active =
                path === href || (href !== "/" && path.startsWith(`${href}/`))
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
            <div className="min-w-0 [scrollbar-width:none] overflow-x-auto">
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
      {demo !== "off" && (
        <Link
          href="/settings"
          className="block bg-amber-400 px-4 py-1.5 text-center text-xs font-semibold text-amber-950"
        >
          Demo mode · amounts are{" "}
          {demo === "scramble" ? "scrambled (not real)" : "hidden"} and saving
          is off — turn off in Settings
        </Link>
      )}
      {/* Bottom padding on phones keeps content clear of the tab bar. */}
      <main className="mx-auto w-full max-w-7xl px-4 pt-6 pb-[calc(5.5rem+env(safe-area-inset-bottom))] sm:px-6 sm:pb-6 2xl:max-w-[1600px]">
        {children}
      </main>

      {/* Phones: thumb-reachable tab bar. */}
      <nav
        aria-label="Main"
        className="bg-background/95 supports-backdrop-filter:backdrop-blur fixed inset-x-0 bottom-0 z-30 border-t pb-[env(safe-area-inset-bottom)] sm:hidden"
      >
        <div className="grid grid-cols-7">
          {nav.map(({ href, label, short, icon: Icon }) => {
            const active =
              path === href || (href !== "/" && path.startsWith(`${href}/`))
            return (
              <Link
                key={href}
                href={href}
                aria-label={label}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex h-14 flex-col items-center justify-center gap-1 text-[10px] font-medium transition-colors active:bg-muted",
                  active ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {active && (
                  <span className="bg-primary absolute inset-x-3 top-0 h-0.5" />
                )}
                <Icon className="size-5" />
                <span className="max-w-full truncate px-0.5">
                  {short ?? label}
                </span>
              </Link>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
