"use client"

import { cn } from "@/lib/utils"

/**
 * Radial gauge for the savings rate: arc = share of income kept, clamped to
 * 0-100% while the label prints the true value. `inProgress` mutes it for a
 * month whose income may not have landed yet.
 */
export function SavingsRing({
  rate,
  size = 128,
  stroke = 10,
  inProgress = false,
  className,
}: {
  rate: number | null
  size?: number
  stroke?: number
  inProgress?: boolean
  className?: string
}) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const negative = rate != null && rate < 0
  // A finished overspent month fills rose; an in-progress deficit shows no arc.
  const shown =
    rate == null || (inProgress && negative) ? 0 : Math.min(1, Math.abs(rate))
  const value = rate == null ? "—" : `${Math.round(rate * 100)}%`
  const label = inProgress ? "so far" : negative ? "overspent" : "saved"

  return (
    <div
      className={cn("relative shrink-0", className)}
      style={{ width: size, height: size }}
      role="img"
      aria-label={`Savings rate ${value}${inProgress ? " so far" : ""}`}
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
            inProgress
              ? "stroke-muted-foreground/50"
              : negative
                ? "stroke-(--viz-spent)"
                : "stroke-(--viz-income)",
          )}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className={cn(
            "font-semibold tracking-tight",
            inProgress && "text-muted-foreground",
          )}
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
