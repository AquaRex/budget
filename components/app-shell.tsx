"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useTheme } from "next-themes"
import { LayoutDashboard, Moon, Receipt, Sun, TrendingUp, LogOut } from "lucide-react"

import { cn } from "@/lib/utils"
import { useAuth } from "@/components/auth/auth-provider"
import { Button } from "@/components/ui/button"

const nav = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/bills", label: "Bills", icon: Receipt },
  { href: "/income", label: "Income", icon: TrendingUp },
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
        <div className="mx-auto flex h-14 w-full max-w-7xl items-center gap-4 px-4 sm:px-6 2xl:max-w-[1600px]">
          <span className="font-semibold tracking-tight">Budget</span>
          <nav className="flex items-center gap-1">
            {nav.map(({ href, label, icon: Icon }) => {
              const active = path === href
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors",
                    active
                      ? "bg-secondary text-secondary-foreground font-medium"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary/60",
                  )}
                >
                  <Icon className="size-4" />
                  <span className="hidden sm:inline">{label}</span>
                </Link>
              )
            })}
          </nav>
          <div className="ml-auto flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
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
      <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 2xl:max-w-[1600px]">
        {children}
      </main>
    </div>
  )
}
