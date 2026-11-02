"use client"

import { useEffect } from "react"

const held = (e: KeyboardEvent | MouseEvent) => e.ctrlKey || e.altKey

/**
 * Hold Ctrl or Alt to select text anywhere, buttons and rows included: every
 * element becomes selectable, presses never reach the app (no row selection,
 * dragging or menus), and the click that ends a text drag is swallowed.
 */
export function TextSelectMode() {
  useEffect(() => {
    const root = document.documentElement
    const sync = (e: KeyboardEvent) => {
      root.toggleAttribute("data-text-select", held(e))
    }
    const off = () => root.removeAttribute("data-text-select")
    const press = (e: MouseEvent) => {
      if (held(e)) {
        e.stopPropagation()
      }
    }
    const click = (e: MouseEvent) => {
      if (held(e) && !window.getSelection()?.isCollapsed) {
        e.preventDefault()
        e.stopPropagation()
      }
    }
    window.addEventListener("keydown", sync)
    window.addEventListener("keyup", sync)
    window.addEventListener("blur", off)
    window.addEventListener("pointerdown", press, true)
    window.addEventListener("mousedown", press, true)
    window.addEventListener("click", click, true)
    return () => {
      window.removeEventListener("keydown", sync)
      window.removeEventListener("keyup", sync)
      window.removeEventListener("blur", off)
      window.removeEventListener("pointerdown", press, true)
      window.removeEventListener("mousedown", press, true)
      window.removeEventListener("click", click, true)
    }
  }, [])
  return null
}
