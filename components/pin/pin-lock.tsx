"use client"

import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { AnimatePresence, motion } from "motion/react"
import type { User } from "@supabase/supabase-js"

import { useAuth } from "@/components/auth/auth-provider"
import { PinPad } from "@/components/pin/pin-pad"
import { getDemoMode, setDemoOverride } from "@/lib/demo-mode"
import {
  PIN_MAX,
  clearPinFailures,
  hasBiometric,
  pinCooldownUntil,
  recordPinFailure,
  refreshPinRecord,
  usePinRecord,
  verifyBiometric,
  verifyPin,
  type PinRecord,
} from "@/lib/pin-lock"
import { isDemoEmail } from "@/lib/supabase/client"

/**
 * Asks for the account's PIN every time the app is opened: on load, and again
 * whenever it comes back after being hidden (app switched, phone locked, tab
 * changed). On load the app renders behind the blur in demo mode ("Hidden",
 * unless a demo mode is already on) so real numbers never paint; unlocking
 * drops back to the saved mode. Re-locking on return only blurs, so a form
 * left half-filled survives a trip to the bank app.
 * `skip` is set right after a full password + 2FA sign-in on this load.
 */
export function PinLock({
  skip,
  children,
}: {
  skip: boolean
  children: ReactNode
}) {
  const { session } = useAuth()
  const user = session?.user ?? null
  const exempt = !user || isDemoEmail(user.email)
  const record = usePinRecord(user)
  const hasPin = !exempt && record !== null
  const [locked, setLocked] = useState(() => {
    const on = hasPin && !skip
    // Set before the app's first render so real numbers never paint.
    if (on && getDemoMode() === "off") {
      setDemoOverride("mask", false)
    }
    return on
  })
  const everLocked = useRef(locked)
  const showLock = locked && hasPin

  // Back to the saved demo mode once unlocked (or the PIN was removed).
  useEffect(() => {
    if (!showLock) {
      setDemoOverride(null)
    }
  }, [showLock])

  useEffect(() => {
    if (!showLock) {
      return
    }
    const root = document.documentElement
    const prev = root.style.overflow
    root.style.overflow = "hidden"
    return () => {
      root.style.overflow = prev
    }
  }, [showLock])

  // A PIN set on another device may not be in this session yet: check the
  // account on open, and lock if one turns up.
  const onFresh = useEffectEvent((rec: PinRecord | null) => {
    if (rec && !skip && !everLocked.current) {
      everLocked.current = true
      if (getDemoMode() === "off") {
        setDemoOverride("mask")
      }
      setLocked(true)
    }
  })
  useEffect(() => {
    if (exempt) {
      return
    }
    refreshPinRecord().then(onFresh, () => {})
  }, [exempt])

  // Lock as soon as the app is hidden, so it's locked when it's opened again
  // (and in the app switcher's snapshot).
  const onVisibility = useEffectEvent(() => {
    if (document.visibilityState === "hidden") {
      if (hasPin) {
        everLocked.current = true
        setLocked(true)
      }
    } else if (!exempt) {
      refreshPinRecord().catch(() => {})
    }
  })
  useEffect(() => {
    document.addEventListener("visibilitychange", onVisibility)
    return () => document.removeEventListener("visibilitychange", onVisibility)
  }, [])

  return (
    <>
      <div
        className="contents"
        inert={showLock}
        aria-hidden={showLock || undefined}
      >
        {children}
      </div>
      <AnimatePresence>
        {showLock && user && record && (
          <LockScreen
            user={user}
            record={record}
            onUnlock={() => setLocked(false)}
          />
        )}
      </AnimatePresence>
    </>
  )
}

function LockScreen({
  user,
  record,
  onUnlock,
}: {
  user: User
  record: PinRecord
  onUnlock: () => void
}) {
  const { signOut } = useAuth()
  const [pin, setPin] = useState("")
  const [shake, setShake] = useState(0)
  const [wrong, setWrong] = useState(false)
  const [done, setDone] = useState(false)
  const [until, setUntil] = useState(() => pinCooldownUntil())
  const [now, setNow] = useState(() => Date.now())
  const [bio] = useState(() => hasBiometric(user.id))
  const [scanning, setScanning] = useState(false)
  const busy = useRef(false)

  const waiting = until > now
  const disabled = done || waiting

  useEffect(() => {
    if (until <= Date.now()) {
      return
    }
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [until])

  function succeed() {
    busy.current = true
    clearPinFailures()
    setDone(true)
    setTimeout(onUnlock, 500)
  }

  async function press(d: string) {
    if (busy.current || disabled || pin.length >= PIN_MAX) {
      return
    }
    const next = pin + d
    setPin(next)
    setWrong(false)
    if (next.length !== record.len) {
      return
    }
    busy.current = true
    if (await verifyPin(next, record)) {
      succeed()
      return
    }
    setWrong(true)
    setShake((s) => s + 1)
    const u = recordPinFailure()
    setUntil(u)
    setNow(Date.now())
    setTimeout(() => {
      setPin("")
      busy.current = false
    }, 450)
  }

  function back() {
    if (busy.current || done) {
      return
    }
    setPin((p) => p.slice(0, -1))
    setWrong(false)
  }

  async function scan() {
    if (scanning || done) {
      return
    }
    setScanning(true)
    try {
      if (await verifyBiometric(user.id)) {
        succeed()
      }
    } catch {
      // Cancelled or no sensor match: the PIN still works.
    } finally {
      setScanning(false)
    }
  }

  const onKey = useEffectEvent((e: KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey) {
      return
    }
    if (/^[0-9]$/.test(e.key)) {
      e.preventDefault()
      void press(e.key)
    } else if (e.key === "Backspace") {
      e.preventDefault()
      back()
    }
  })

  useEffect(() => {
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  // Phones: offer the fingerprint straight away (a tap on the shield retries),
  // waiting until the app is actually on screen when it re-locked in the
  // background.
  const autoScan = useEffectEvent(() => void scan())
  const prompted = useRef(false)
  useEffect(() => {
    if (!bio || !matchMedia("(pointer: coarse)").matches) {
      return
    }
    function go() {
      if (document.visibilityState === "visible" && !prompted.current) {
        prompted.current = true
        autoScan()
      }
    }
    go()
    document.addEventListener("visibilitychange", go)
    return () => document.removeEventListener("visibilitychange", go)
  }, [bio])

  const hint = waiting
    ? `Too many tries. Wait ${Math.ceil((until - now) / 1000)}s`
    : wrong
      ? "Wrong PIN"
      : bio
        ? "Enter your PIN or tap the fingerprint"
        : "Enter your PIN"

  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label="Enter PIN"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="bg-background/30 pointer-events-auto fixed inset-0 z-[100] flex flex-col items-center justify-center gap-4 overflow-y-auto px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur-xl"
    >
      <motion.div
        initial={{ scale: 0.96, y: 8 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 1.04 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        className="bg-card/90 rounded-[2rem] border shadow-2xl"
      >
        <PinPad
          title="Budget locked"
          hint={hint}
          error={wrong || waiting}
          digits={pin.length}
          filled={done}
          shake={shake}
          disabled={disabled}
          shieldIcon={bio && !done ? "fingerprint" : "check"}
          onShield={bio && !done ? scan : undefined}
          scanning={scanning}
          onDigit={(d) => void press(d)}
          onBack={back}
        />
      </motion.div>
      <button
        type="button"
        onClick={() => void signOut()}
        className="text-muted-foreground hover:text-foreground text-xs underline-offset-4 hover:underline"
      >
        Forgot PIN? Sign out
      </button>
    </motion.div>
  )
}
