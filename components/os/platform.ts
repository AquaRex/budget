"use client"

import { useEffect, useSyncExternalStore } from "react"

// Small external stores for browser state the app chrome reacts to.
function createStore<T>(initial: T) {
  let value = initial
  const listeners = new Set<() => void>()
  return {
    get: () => value,
    set: (next: T) => {
      value = next
      listeners.forEach((l) => l())
    },
    subscribe: (l: () => void) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
  }
}

/* ---------------------------------------------------------- Desktop mode */

// Chrome's "Desktop site" / Samsung Internet's "Desktop version" (often on by
// default on large and foldable screens) ignores the viewport meta and lays the
// page out ~980px wide, shrinking the app to an unreadable "tiny webpage".
// We can't switch it off from the page, so detect it and tell the user how.
// The value is how far the page is scaled down (1 = normal phone layout).
const desktopSite = createStore(1)

function detectDesktopSite() {
  const ratio = window.innerWidth / window.screen.width
  const phoneShrunk = window.screen.width < 600 && window.innerWidth >= 900
  const desktopUaOnTouch =
    navigator.maxTouchPoints > 0 &&
    !/Mobile|Android/i.test(navigator.userAgent) &&
    window.screen.width < 900 &&
    ratio > 1.15
  desktopSite.set(phoneShrunk || desktopUaOnTouch ? ratio : 1)
}

let watchingDesktopSite = false

/** How much a desktop-site layout shrinks the page; 1 when it's a normal phone layout. */
export function useDesktopSiteScale(): number {
  useEffect(() => {
    if (watchingDesktopSite) {
      return
    }
    watchingDesktopSite = true
    detectDesktopSite()
    window.addEventListener("resize", detectDesktopSite)
  }, [])
  return useSyncExternalStore(desktopSite.subscribe, desktopSite.get, () => 1)
}

/* ------------------------------------------------------------- Install */

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>
}

const installPrompt = createStore<InstallPromptEvent | null>(null)
const standalone = createStore(false)
let listening = false

function listenForInstall() {
  if (listening) {
    return
  }
  listening = true
  const media = window.matchMedia("(display-mode: standalone)")
  const update = () =>
    standalone.set(
      media.matches ||
        (navigator as Navigator & { standalone?: boolean }).standalone === true,
    )
  update()
  media.addEventListener("change", update)
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault()
    installPrompt.set(e as InstallPromptEvent)
  })
  window.addEventListener("appinstalled", () => {
    installPrompt.set(null)
    standalone.set(true)
  })
}

/** Start listening early (the browser fires beforeinstallprompt once, on load). */
export function useInstallListener() {
  useEffect(listenForInstall, [])
}

export function useInstall() {
  const prompt = useSyncExternalStore(
    installPrompt.subscribe,
    installPrompt.get,
    () => null,
  )
  const installed = useSyncExternalStore(
    standalone.subscribe,
    standalone.get,
    () => false,
  )
  const install = async () => {
    if (!prompt) {
      return
    }
    await prompt.prompt()
    const { outcome } = await prompt.userChoice
    if (outcome === "accepted") {
      installPrompt.set(null)
    }
  }
  return { canInstall: prompt != null, installed, install }
}
