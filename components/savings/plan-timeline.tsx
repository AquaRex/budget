"use client"

import { cn } from "@/lib/utils"
import type { Lot } from "@/lib/savings/types"
import { freeFrom, monthIndexOf, yearOf } from "@/lib/savings/compute"
import { kr } from "@/components/stats/display"
import { formatUnitsShort, monthLabel } from "@/components/savings/format"

const YEARS = 10
const SPAN = YEARS * 12

const waiting = "bg-amber-400/80 dark:bg-amber-500/70"
const bonusQueued =
  "bg-[repeating-linear-gradient(135deg,var(--viz-income)_0_4px,transparent_4px_8px)] opacity-70"
const free = "bg-emerald-500/80 dark:bg-emerald-500/70"

/**
 * Ten years across, one row per purchase: amber while its bonus is pending,
 * hatched while its bonus shares queue behind newer purchases (FIFO), green
 * once all of it can be sold without losing bonus.
 */
export function PlanTimeline({
  lots,
  todayIndex,
}: {
  lots: Lot[]
  todayIndex: number
}) {
  const buys = lots.filter((l) => l.source === "buy")
  const thisYear = yearOf(todayIndex)
  const firstYear = buys.length ? yearOf(buys[0].monthIndex) : thisYear
  const startYear = Math.max(firstYear, thisYear - 5)
  const start = monthIndexOf(startYear, 1)
  const end = start + SPAN
  const pct = (i: number) =>
    `${(Math.min(Math.max(i - start, 0), SPAN) / SPAN) * 100}%`
  const width = (a: number, b: number) =>
    `${((Math.min(b, end) - Math.max(a, start)) / SPAN) * 100}%`
  const visible = (a: number, b: number) => b > start && a < end

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto">
        <div className="min-w-[720px]">
          <div className="grid grid-cols-[9rem_1fr] text-[11px]">
            <span />
            <div className="relative flex">
              {Array.from({ length: YEARS }, (_, k) => (
                <span
                  key={k}
                  className={cn(
                    "flex-1 border-l px-1.5 pb-1 font-semibold tabular-nums",
                    startYear + k === thisYear
                      ? "text-foreground"
                      : "text-muted-foreground",
                  )}
                >
                  {startYear + k}
                </span>
              ))}
            </div>
          </div>

          <div className="relative grid grid-cols-[9rem_1fr]">
            {buys.length === 0 && (
              <>
                <span />
                <p className="text-muted-foreground border-l py-6 pl-3 text-sm">
                  No purchases yet — click a month in the grid below to add one.
                  Each purchase shows here with its bonus date and when you can
                  sell.
                </p>
              </>
            )}
            {buys.map((buy) => {
              const vest = buy.vestIndex ?? buy.monthIndex
              const ownFree = freeFrom(lots, buy)
              const bonus = lots.find(
                (l) => l.source === "bonus" && l.monthIndex === vest,
              )
              const bonusFree = bonus ? freeFrom(lots, bonus) : ownFree
              const soldOut = buy.held === 0
              return (
                <div key={buy.monthIndex} className="contents">
                  <div className="flex flex-col justify-center border-t py-1.5 pr-2 text-xs">
                    <span className="font-medium">
                      {monthLabel(buy.monthIndex)}
                    </span>
                    <span className="text-muted-foreground tabular-nums">
                      {formatUnitsShort(buy.bought)} sh · {kr(buy.paid)}
                    </span>
                  </div>
                  <div className="relative h-12 border-t border-l">
                    {Array.from({ length: YEARS - 1 }, (_, k) => (
                      <span
                        key={k}
                        className="bg-border absolute inset-y-0 w-px"
                        style={{ left: `${((k + 1) / YEARS) * 100}%` }}
                      />
                    ))}
                    {soldOut ? (
                      visible(buy.monthIndex, vest) && (
                        <span
                          className="bg-muted-foreground/30 absolute top-3 h-6"
                          style={{
                            left: pct(buy.monthIndex),
                            width: width(buy.monthIndex, vest),
                          }}
                          title="Sold before the bonus date — no bonus"
                        >
                          <span className="text-muted-foreground px-1.5 text-[10px] leading-6 line-through">
                            sold early
                          </span>
                        </span>
                      )
                    ) : (
                      <>
                        {visible(buy.monthIndex, vest) && (
                          <span
                            className={cn(
                              "absolute top-3 h-6 overflow-hidden",
                              waiting,
                            )}
                            style={{
                              left: pct(buy.monthIndex),
                              width: width(buy.monthIndex, vest),
                            }}
                            title={`${monthLabel(buy.monthIndex)} – ${monthLabel(vest)}: waiting for bonus. Selling now loses it.`}
                          >
                            <span className="px-1.5 text-[10px] leading-6 font-semibold whitespace-nowrap text-amber-950">
                              {formatUnitsShort(buy.held)} sh · bonus{" "}
                              {monthLabel(vest)}
                            </span>
                          </span>
                        )}
                        {bonus &&
                          bonusFree > vest &&
                          visible(vest, bonusFree) && (
                            <span
                              className={cn("absolute top-3 h-6", bonusQueued)}
                              style={{
                                left: pct(vest),
                                width: width(vest, bonusFree),
                              }}
                              title={`${monthLabel(vest)} – ${monthLabel(bonusFree)}: the ${formatUnitsShort(buy.held)} shares are free; the ${formatUnitsShort(bonus.held)} bonus shares queue behind newer purchases (FIFO).`}
                            />
                          )}
                        {visible(Math.max(ownFree, bonusFree), end) && (
                          <span
                            className={cn("absolute top-3 h-6", free)}
                            style={{
                              left: pct(Math.max(ownFree, bonusFree)),
                              width: width(Math.max(ownFree, bonusFree), end),
                            }}
                            title={`From ${monthLabel(Math.max(ownFree, bonusFree))}: shares and bonus can be sold without losing anything.`}
                          >
                            <span className="px-1.5 text-[10px] leading-6 font-semibold whitespace-nowrap text-emerald-950">
                              all free
                            </span>
                          </span>
                        )}
                        {bonus && visible(vest, vest + 1) && (
                          <span
                            className="absolute top-0 flex -translate-x-1/2 flex-col items-center"
                            style={{ left: pct(vest) }}
                            title={`${monthLabel(vest)}: +${formatUnitsShort(bonus.bought)} bonus shares`}
                          >
                            <span className="text-[10px] leading-3 font-semibold text-emerald-700 dark:text-emerald-400">
                              +{formatUnitsShort(bonus.bought)}
                            </span>
                            <span className="mt-0.5 size-2.5 rotate-45 border-2 border-emerald-600 bg-[var(--card)] dark:border-emerald-400" />
                          </span>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )
            })}
            {todayIndex >= start && todayIndex < end && (
              <span
                className="pointer-events-none absolute inset-y-0 right-0 left-[9rem]"
                aria-hidden
              >
                <span
                  className="bg-foreground absolute inset-y-0 w-0.5"
                  style={{ left: pct(todayIndex) }}
                >
                  <span className="bg-foreground text-background absolute -top-0.5 left-1 px-1 text-[9px] font-semibold tracking-wider uppercase">
                    Today
                  </span>
                </span>
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1.5 text-[11px]">
        <Legend className={waiting}>
          Waiting for bonus — selling loses it
        </Legend>
        <Legend className={bonusQueued}>
          Shares free · bonus shares queue behind newer buys
        </Legend>
        <Legend className={free}>Everything free to sell</Legend>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rotate-45 border-2 border-emerald-600 dark:border-emerald-400" />{" "}
          Bonus arrives
        </span>
      </div>
      <p className="text-muted-foreground text-xs">
        Based on the purchases entered so far. Each new purchase joins the queue, so
        it pushes the &quot;all free&quot; date of the bonus shares before it later.
      </p>
    </div>
  )
}

function Legend({
  className,
  children,
}: {
  className: string
  children: React.ReactNode
}) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn("h-3 w-5", className)} />
      {children}
    </span>
  )
}
