"use client"

import { cn } from "@/lib/utils"

/**
 * Radial gauge for the savings rate: arc = share of income kept, clamped to
 * 0-100% while the label prints the true value. `expected` marks a forecast
 * (current month) rather than a settled rate.
 */
export function SavingsRing({
  rate,
  size = 128,
  stroke = 10,
  expected = false,
  className,
}: {
  rate: number | null
  size?: number
  stroke?: number
  expected?: boolean
  className?: string
}) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const negative = rate != null && rate < 0
  const shown = rate == null ? 0 : Math.min(1, Math.abs(rate))
  const value = rate == null ? "—" : `${Math.round(rate * 100)}%`
  const label = expected ? "expected" : negative ? "overspent" : "saved"

  return (
    <div
      className={cn("relative shrink-0", className)}
      style={{ width: size, height: size }}
      role="img"
      aria-label={`Savings rate ${value}${expected ? " expected" : ""}`}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          className="stroke-muted"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeDasharray={c}
          strokeDashoffset={c * (1 - shown)}
          className={cn(
            "transition-[stroke-dashoffset] duration-700 ease-out motion-reduce:transition-none",
            negative ? "stroke-(--viz-spent)" : "stroke-(--viz-income)",
          )}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className="font-semibold tracking-tight"
          style={{ fontSize: size * (value.length > 5 ? 0.18 : 0.24) }}
        >
          {value}
        </span>
        <span
          className="text-muted-foreground font-medium tracking-widest uppercase"
          style={{ fontSize: Math.max(9, size * 0.075) }}
        >
          {label}
        </span>
      </div>
    </div>
  )
}
