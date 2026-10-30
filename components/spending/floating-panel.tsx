"use client"

import { useEffect, useRef } from "react"

const GAP = 4
const MARGIN = 8

/**
 * A popover pinned to a trigger's screen rect. Fixed-positioned so it's never
 * clipped by the list's scroll containers; closes on outside press, Escape,
 * page scroll or resize (it would otherwise drift off its anchor).
 */
export function FloatingPanel({
  anchor,
  width,
  onClose,
  children,
}: {
  anchor: DOMRect
  width: number
  onClose: () => void
  children: React.ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose()
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose()
      }
    }
    document.addEventListener("pointerdown", onDown)
    document.addEventListener("keydown", onKey)
    window.addEventListener("scroll", onClose, { passive: true })
    window.addEventListener("resize", onClose)
    return () => {
      document.removeEventListener("pointerdown", onDown)
      document.removeEventListener("keydown", onKey)
      window.removeEventListener("scroll", onClose)
      window.removeEventListener("resize", onClose)
    }
  }, [onClose])

  const w = Math.min(width, window.innerWidth - MARGIN * 2)
  const left = Math.min(
    Math.max(anchor.left, MARGIN),
    window.innerWidth - w - MARGIN,
  )
  // Open upwards when the trigger sits in the lower part of the screen.
  const below = anchor.bottom < window.innerHeight * 0.6
  const style: React.CSSProperties = below
    ? { left, width: w, top: anchor.bottom + GAP, maxHeight: window.innerHeight - anchor.bottom - GAP - MARGIN }
    : { left, width: w, bottom: window.innerHeight - anchor.top + GAP, maxHeight: anchor.top - GAP - MARGIN }

  return (
    <div
      ref={ref}
      role="dialog"
      style={style}
      className="bg-popover text-popover-foreground fixed z-50 flex flex-col overflow-hidden border shadow-lg"
    >
      {children}
    </div>
  )
}
