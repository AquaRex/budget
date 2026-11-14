"use client"

import { useEffect, useEffectEvent, useState } from "react"
import { Check } from "lucide-react"
import { toast } from "sonner"

import { useAuth } from "@/components/auth/auth-provider"
import { Key, PinPad } from "@/components/pin/pin-pad"
import { Panel } from "@/components/stats/panel"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { errMessage } from "@/lib/errors"
import {
  PIN_MAX,
  PIN_MIN,
  biometricSupported,
  enrollBiometric,
  usePinRecord,
  hasBiometric,
  removeBiometric,
  savePin,
} from "@/lib/pin-lock"
import { isDemoEmail } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"

export function PinLockSettings() {
  const { session } = useAuth()
  const user = session?.user ?? null
  const record = usePinRecord(user)
  const [setting, setSetting] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [canBio, setCanBio] = useState(false)
  const [bio, setBio] = useState(() => (user ? hasBiometric(user.id) : false))

  useEffect(() => {
    void biometricSupported().then(setCanBio)
  }, [])

  if (!user || isDemoEmail(user.email)) {
    return null
  }

  async function remove() {
    try {
      await savePin(null)
      removeBiometric()
      setBio(false)
      setConfirmRemove(false)
      toast.success("PIN removed")
    } catch (e) {
      toast.error(errMessage(e, "Something went wrong"))
    }
  }

  async function toggleBio(on: boolean) {
    if (!user) {
      return
    }
    if (!on) {
      removeBiometric()
      setBio(false)
      return
    }
    try {
      await enrollBiometric(user.id)
      setBio(true)
      toast.success("Fingerprint unlock is on for this device")
    } catch (e) {
      toast.error(errMessage(e, "Something went wrong"))
    }
  }

  return (
    <Panel
      title="PIN lock"
      subtitle={
        record
          ? `A ${record.len}-digit PIN is asked for every time the site loads`
          : "Ask for a PIN every time the site loads"
      }
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => setSetting(true)}>
            {record ? "Change PIN" : "Set PIN"}
          </Button>
          {record && (
            <Button
              size="sm"
              variant={confirmRemove ? "destructive" : "outline"}
              onClick={() => (confirmRemove ? void remove() : setConfirmRemove(true))}
              onBlur={() => setConfirmRemove(false)}
            >
              {confirmRemove ? "Tap again to remove" : "Remove PIN"}
            </Button>
          )}
        </div>
        {record && canBio && (
          <div className="flex flex-col gap-2 sm:flex-row">
            {[
              { on: true, label: "Fingerprint on", hint: "Tap the shield to unlock on this device" },
              { on: false, label: "PIN only", hint: "No fingerprint / face on this device" },
            ].map((o) => (
              <button
                key={o.label}
                type="button"
                aria-pressed={bio === o.on}
                onClick={() => bio !== o.on && void toggleBio(o.on)}
                className={cn(
                  "flex-1 border px-3 py-2 text-left transition-colors",
                  bio === o.on ? "border-primary bg-muted" : "hover:bg-muted/60",
                )}
              >
                <div className="text-sm font-medium">{o.label}</div>
                <div className="text-muted-foreground text-xs">{o.hint}</div>
              </button>
            ))}
          </div>
        )}
      </div>
      <Dialog open={setting} onOpenChange={setSetting}>
        <DialogContent className="w-auto max-w-none rounded-[2rem] p-0 sm:max-w-none">
          <DialogTitle className="sr-only">Set PIN</DialogTitle>
          {setting && <SetPin onDone={() => setSetting(false)} />}
        </DialogContent>
      </Dialog>
    </Panel>
  )
}

function SetPin({ onDone }: { onDone: () => void }) {
  const [first, setFirst] = useState<string | null>(null)
  const [pin, setPin] = useState("")
  const [shake, setShake] = useState(0)
  const [hint, setHint] = useState<{ text: string; error?: boolean }>({
    text: `${PIN_MIN}–${PIN_MAX} digits, then tap ✓`,
  })
  const [busy, setBusy] = useState(false)

  async function save(value: string) {
    setBusy(true)
    try {
      await savePin(value)
      toast.success("PIN saved")
      onDone()
    } catch (e) {
      setBusy(false)
      setHint({ text: errMessage(e, "Could not save the PIN"), error: true })
    }
  }

  function press(d: string) {
    if (busy || pin.length >= PIN_MAX) {
      return
    }
    const next = pin + d
    setPin(next)
    if (first !== null && next.length === first.length) {
      if (next === first) {
        void save(next)
      } else {
        setShake((s) => s + 1)
        setHint({ text: "Didn't match, try again", error: true })
        setTimeout(() => setPin(""), 450)
      }
    }
  }

  function confirmFirst() {
    if (pin.length < PIN_MIN) {
      return
    }
    setFirst(pin)
    setPin("")
    setHint({ text: "Enter it once more" })
  }

  const onKey = useEffectEvent((e: KeyboardEvent) => {
    if (/^[0-9]$/.test(e.key)) {
      e.preventDefault()
      press(e.key)
    } else if (e.key === "Backspace") {
      e.preventDefault()
      setPin((p) => p.slice(0, -1))
    } else if (e.key === "Enter" && first === null) {
      e.preventDefault()
      confirmFirst()
    }
  })

  useEffect(() => {
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  return (
    <PinPad
      title={first === null ? "New PIN" : "Confirm PIN"}
      hint={hint.text}
      error={hint.error}
      digits={pin.length}
      shake={shake}
      disabled={busy}
      leftKey={
        first === null ? (
          <Key
            aria-label="Next"
            disabled={pin.length < PIN_MIN}
            onClick={confirmFirst}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Check className="size-6" strokeWidth={2.75} />
          </Key>
        ) : undefined
      }
      onDigit={press}
      onBack={() => setPin((p) => p.slice(0, -1))}
    />
  )
}
