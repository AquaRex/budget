"use client"

import { AnimatePresence, motion } from "motion/react"
import { Check, Delete, Fingerprint, Shield } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"]

/**
 * The shield + dots + numpad, padded by the same value (--pin-gap) used
 * between keys, so the keys sit evenly against each other and the frame.
 */
export function PinPad({
  title,
  hint,
  error,
  digits,
  filled = false,
  shake = 0,
  disabled = false,
  shieldIcon = "check",
  onShield,
  scanning = false,
  leftKey,
  onDigit,
  onBack,
}: {
  title: string
  hint?: React.ReactNode
  error?: boolean
  digits: number
  /** Show every slot as a dot (fingerprint unlock "fills in" the PIN). */
  filled?: boolean
  /** Bump to shake the dots (wrong PIN). */
  shake?: number
  disabled?: boolean
  shieldIcon?: "check" | "fingerprint"
  /** Makes the shield a button (fingerprint unlock). */
  onShield?: () => void
  scanning?: boolean
  leftKey?: React.ReactNode
  onDigit: (d: string) => void
  onBack: () => void
}) {
  const slots = Math.max(4, digits)

  const inner = (
    <span className="relative grid size-20 place-items-center">
      <Shield
        className="text-primary absolute inset-0 size-20"
        strokeWidth={1.5}
      />
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={shieldIcon}
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.6 }}
          transition={{ duration: 0.2 }}
          className="relative -mt-1"
        >
          {shieldIcon === "fingerprint" ? (
            <Fingerprint
              className={cn("text-primary size-8", scanning && "animate-pulse")}
              strokeWidth={2}
            />
          ) : (
            <Check className="text-primary size-8" strokeWidth={2.75} />
          )}
        </motion.span>
      </AnimatePresence>
    </span>
  )

  return (
    <div className="flex flex-col items-center gap-(--pin-gap) p-(--pin-gap) [--pin-gap:1.25rem]">
      {onShield ? (
        <button
          type="button"
          onClick={onShield}
          aria-label="Unlock with fingerprint"
          className="focus-visible:ring-ring/30 outline-none focus-visible:ring-2 active:translate-y-px"
        >
          {inner}
        </button>
      ) : (
        inner
      )}

      <div className="flex flex-col items-center gap-1 text-center">
        <h2 className="text-muted-foreground text-[11px] font-semibold tracking-widest uppercase">
          {title}
        </h2>
        <p
          aria-live="polite"
          className={cn(
            "min-h-4 text-xs",
            error ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {hint}
        </p>
      </div>

      <motion.div
        key={shake}
        initial={false}
        animate={shake ? { x: [0, -12, 12, -9, 9, -4, 4, 0] } : undefined}
        transition={{ duration: 0.45 }}
        aria-label={`${digits} digits entered`}
        className="flex h-4 items-center justify-center gap-3"
      >
        {Array.from({ length: slots }, (_, i) => {
          const dot = filled || i < digits
          return (
            <span key={i} className="grid h-4 w-6 place-items-center">
              <span
                style={{ transitionDelay: filled ? `${i * 60}ms` : "0ms" }}
                className={cn(
                  "block transition-all duration-200",
                  dot
                    ? "bg-primary size-3"
                    : "bg-muted-foreground/50 h-0.5 w-6",
                )}
              />
            </span>
          )
        })}
      </motion.div>

      <div className="grid grid-cols-3 gap-(--pin-gap)">
        {KEYS.map((k) => (
          <Key key={k} disabled={disabled} onClick={() => onDigit(k)}>
            {k}
          </Key>
        ))}
        {leftKey ?? <span />}
        <Key disabled={disabled} onClick={() => onDigit("0")}>
          0
        </Key>
        <Key
          disabled={disabled || digits === 0}
          onClick={onBack}
          aria-label="Delete last digit"
          variant="ghost"
        >
          <Delete />
        </Key>
      </div>
    </div>
  )
}

/** A numpad key: the site's own Button, just square and big. */
export function Key({
  className,
  variant = "outline",
  ...props
}: React.ComponentProps<typeof Button>) {
  return (
    <Button
      variant={variant}
      className={cn(
        "size-[4.25rem] text-xl tabular-nums max-[359px]:size-16 [&_svg:not([class*='size-'])]:size-5",
        className,
      )}
      {...props}
    />
  )
}
