"use client"

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Ellipsis,
  Gauge,
  Layers,
  ReceiptText,
  Wallet,
  X,
} from "lucide-react"

import type { DashboardStats } from "@/lib/stats/types"
import { useDashboardStats } from "@/lib/stats/use-dashboard-stats"
import { MONTHS_LONG } from "@/lib/budget"
import { cn } from "@/lib/utils"
import { getYear, setYear, useYear } from "@/lib/year"
import { useCountTransfers } from "@/lib/count-transfers"
import { formatShortDate } from "@/components/stats/display"
import { DesktopSiteNotice } from "@/components/os/desktop-site-notice"
import { useInstall, useInstallListener } from "@/components/os/platform"

const TABS = [
  { href: "/os", label: "Home", icon: Gauge },
  { href: "/os/spending", label: "Spending", icon: Wallet },
  { href: "/os/budget", label: "Budget", icon: ReceiptText },
  { href: "/os/groups", label: "Groups", icon: Layers },
  { href: "/os/more", label: "More", icon: Ellipsis },
] as const

const SWIPE_MIN = 60
const INSTALL_DISMISSED = "budget.os.installDismissed"
const MONTH_KEY = "budget.os.month"

type OsContextValue = {
  year: number
  month: number
  direction: 1 | -1
  step: (delta: 1 | -1) => void
  setMonth: (month: number) => void
  stats: DashboardStats // month scope for the focused month, shared by every tab
}

const OsContext = createContext<OsContextValue | null>(null)

export function useOs(): OsContextValue {
  const ctx = useContext(OsContext)
  if (!ctx) {
    throw new Error("useOs must be used inside <OsShell>")
  }
  return ctx
}

/** App chrome for /os: one month shared by every tab, tabs below or beside. */
export function OsShell({ children }: { children: ReactNode }) {
  useInstallListener()
  const pathname = usePathname()
  const path = pathname?.replace(/\/+$/, "") || "/os"
  const year = useYear()
  // Kept per session so a remount (e.g. changing the date mode) keeps the month.
  const [month, setMonthState] = useState(() => {
    try {
      const saved = Number(sessionStorage.getItem(MONTH_KEY))
      return saved >= 1 && saved <= 12 ? saved : new Date().getMonth() + 1
    } catch {
      return new Date().getMonth() + 1
    }
  })
  const setMonth = (m: number) => {
    setMonthState(m)
    try {
      sessionStorage.setItem(MONTH_KEY, String(m))
    } catch {}
  }
  const [direction, setDirection] = useState<1 | -1>(1)
  const touch = useRef<{ x: number; y: number } | null>(null)
  const stats = useDashboardStats({
    year,
    month,
    scope: "month",
    includeIncomplete: false,
  })
  const { canInstall, installed } = useInstall()
  const countTransfers = useCountTransfers()
  // The strip only renders once the browser offers install, so reading storage
  // here can't cause a hydration mismatch.
  const [installDismissed, setInstallDismissed] = useState(() => {
    try {
      return localStorage.getItem(INSTALL_DISMISSED) === "1"
    } catch {
      return true
    }
  })

  // The app opens on today, whatever year the website was left on.
  useEffect(() => {
    const now = new Date().getFullYear()
    if (getYear() !== now) {
      setYear(now)
    }
  }, [])

  // App feel: no rubber-band/pull-to-refresh on the shell while it's mounted.
  useEffect(() => {
    const root = document.documentElement
    root.style.overscrollBehavior = "none"
    return () => {
      root.style.overscrollBehavior = ""
    }
  }, [])

  const step = (delta: 1 | -1) => {
    setDirection(delta)
    const next = month + delta
    if (next < 1) {
      setYear(year - 1)
      setMonth(12)
    } else if (next > 12) {
      setYear(year + 1)
      setMonth(1)
    } else {
      setMonth(next)
    }
  }

  const goToday = () => {
    const now = new Date()
    setYear(now.getFullYear())
    setMonth(now.getMonth() + 1)
  }

  const monthTabs = path !== "/os/more"
  const onTouchStart = (e: React.TouchEvent) => {
    const target = e.target as HTMLElement
    if (
      !monthTabs ||
      // Sheets are portals, but their touches still bubble here through React.
      target.closest("[data-slot=chart], input, [data-no-swipe], [role=dialog]")
    ) {
      touch.current = null
      return
    }
    touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
  }
  const onTouchEnd = (e: React.TouchEvent) => {
    if (!touch.current) {
      return
    }
    const dx = e.changedTouches[0].clientX - touch.current.x
    const dy = e.changedTouches[0].clientY - touch.current.y
    touch.current = null
    if (Math.abs(dx) > SWIPE_MIN && Math.abs(dx) > Math.abs(dy) * 1.5) {
      step(dx < 0 ? 1 : -1)
    }
  }

  const isCurrent = stats.months[month - 1]?.status === "current"
  const stale =
    stats.dataThrough != null &&
    (Date.parse(stats.today) - Date.parse(stats.dataThrough)) / 86_400_000 > 3
  const title = TABS.find((t) => t.href === path)?.label ?? "Home"
  const showInstall =
    path === "/os" && canInstall && !installed && !installDismissed

  return (
    <OsContext.Provider
      value={{ year, month, direction, step, setMonth, stats }}
    >
      <div className="bg-background flex min-h-dvh w-full overflow-x-clip pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)] select-none [-webkit-tap-highlight-color:transparent]">
        <nav
          aria-label="App"
          className="sticky top-0 hidden h-dvh w-22 shrink-0 flex-col gap-1 border-r pt-[calc(env(safe-area-inset-top)+0.75rem)] pb-[env(safe-area-inset-bottom)] min-[600px]:flex"
        >
          {TABS.map((t) => (
            <TabLink key={t.href} tab={t} active={path === t.href} rail />
          ))}
        </nav>

        <div className="flex min-w-0 flex-1 flex-col">
          <DesktopSiteNotice />
          <header className="bg-background/90 supports-backdrop-filter:backdrop-blur sticky top-0 z-20 border-b pt-[env(safe-area-inset-top)]">
            <div className="mx-auto flex h-14 max-w-5xl items-center gap-1 px-2 min-[600px]:px-4">
              {monthTabs ? (
                <>
                  <button
                    type="button"
                    aria-label="Previous month"
                    onClick={() => step(-1)}
                    className="active:bg-muted flex size-11 shrink-0 items-center justify-center"
                  >
                    <ChevronLeft className="size-5" />
                  </button>
                  <button
                    type="button"
                    onClick={goToday}
                    className="flex min-h-11 min-w-0 flex-1 flex-col items-center justify-center self-stretch leading-tight"
                    aria-label={`${MONTHS_LONG[month - 1]} ${year}${isCurrent ? "" : ", jump to this month"}`}
                  >
                    <span className="truncate text-base font-semibold tracking-tight">
                      {MONTHS_LONG[month - 1]}{" "}
                      <span className="text-muted-foreground font-normal">
                        {year}
                      </span>
                    </span>
                    <span className="text-muted-foreground flex max-w-full items-center gap-1.5 text-[10px] tracking-widest uppercase">
                      {stats.dataThrough && (
                        <span
                          aria-hidden
                          className={cn(
                            "size-1.5 shrink-0 rounded-full",
                            stale ? "bg-amber-500" : "bg-emerald-500",
                          )}
                        />
                      )}
                      <span className="truncate">
                        {[
                          title,
                          stats.dataThrough &&
                            `data ${formatShortDate(stats.dataThrough)}`,
                          countTransfers && "transfers counted",
                          !isCurrent && "tap for today",
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-label="Next month"
                    onClick={() => step(1)}
                    className="active:bg-muted flex size-11 shrink-0 items-center justify-center"
                  >
                    <ChevronRight className="size-5" />
                  </button>
                </>
              ) : (
                <span className="flex-1 px-2 text-base font-semibold tracking-tight">
                  {title}
                </span>
              )}
            </div>
            {showInstall && (
              <InstallStrip
                onDismiss={() => {
                  setInstallDismissed(true)
                  try {
                    localStorage.setItem(INSTALL_DISMISSED, "1")
                  } catch {}
                }}
              />
            )}
          </header>

          <main
            onTouchStart={onTouchStart}
            onTouchEnd={onTouchEnd}
            className="mx-auto w-full max-w-5xl min-w-0 flex-1 px-3 pt-3 pb-[calc(5rem+env(safe-area-inset-bottom))] min-[600px]:px-4 min-[600px]:pb-6"
          >
            {children}
          </main>
        </div>

        <nav
          aria-label="App"
          className="bg-background/95 supports-backdrop-filter:backdrop-blur fixed inset-x-0 bottom-0 z-20 border-t pb-[env(safe-area-inset-bottom)] min-[600px]:hidden"
        >
          <div className="grid h-16 grid-cols-5">
            {TABS.map((t) => (
              <TabLink key={t.href} tab={t} active={path === t.href} />
            ))}
          </div>
        </nav>
      </div>
    </OsContext.Provider>
  )
}

function TabLink({
  tab,
  active,
  rail = false,
}: {
  tab: (typeof TABS)[number]
  active: boolean
  rail?: boolean
}) {
  const Icon = tab.icon
  return (
    <Link
      href={tab.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex flex-col items-center justify-center gap-1 text-[10px] font-semibold tracking-widest uppercase transition-colors",
        rail ? "mx-2 h-16" : "h-16",
        active
          ? "text-foreground"
          : "text-muted-foreground active:text-foreground",
      )}
    >
      <span
        className={cn(
          "flex h-7 w-12 items-center justify-center transition-colors",
          active && "bg-primary text-primary-foreground",
        )}
      >
        <Icon className="size-5" />
      </span>
      {tab.label}
    </Link>
  )
}

function InstallStrip({ onDismiss }: { onDismiss: () => void }) {
  const { install } = useInstall()
  return (
    <div className="bg-muted/60 flex h-11 items-center gap-2 border-t px-3 text-xs">
      <Download className="size-4 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1 truncate">
        Install Budget as an app on this phone
      </span>
      <button
        type="button"
        onClick={() => void install()}
        className="bg-primary text-primary-foreground h-8 px-3 font-semibold tracking-widest uppercase"
      >
        Install
      </button>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={onDismiss}
        className="text-muted-foreground flex size-8 items-center justify-center"
      >
        <X className="size-4" />
      </button>
    </div>
  )
}
