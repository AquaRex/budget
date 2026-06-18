"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react"
import type { Session } from "@supabase/supabase-js"

import { getSupabase, isSupabaseConfigured } from "@/lib/supabase/client"

// The auth flow as a small state machine:
// - "loading":      checking the current session
// - "unconfigured": missing Supabase env vars
// - "password":     no session, show the password screen
// - "enroll":       signed in, no TOTP factor yet -> show QR enrollment
// - "challenge":    signed in, factor exists, needs a 6-digit code -> aal2
// - "ready":        aal2 reached, render the app
export type AuthStatus =
  | "loading"
  | "unconfigured"
  | "password"
  | "enroll"
  | "challenge"
  | "ready"

type AuthContextValue = {
  status: AuthStatus
  session: Session | null
  /** Re-evaluate session + assurance level (call after sign-in / verify). */
  refresh: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>")
  return ctx
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading")
  const [session, setSession] = useState<Session | null>(null)

  const refresh = useCallback(async () => {
    if (!isSupabaseConfigured()) {
      setStatus("unconfigured")
      return
    }
    const supabase = getSupabase()

    const {
      data: { session: current },
    } = await supabase.auth.getSession()
    setSession(current)

    if (!current) {
      setStatus("password")
      return
    }

    // Determine MFA assurance level.
    const { data: aal, error: aalError } =
      await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    if (aalError) {
      setStatus("password")
      return
    }

    if (aal?.currentLevel === "aal2") {
      setStatus("ready")
      return
    }

    // currentLevel aal1: need to step up. If a verified factor exists the
    // SDK reports nextLevel "aal2" -> challenge; otherwise enroll first.
    if (aal?.nextLevel === "aal2") {
      setStatus("challenge")
    } else {
      setStatus("enroll")
    }
  }, [])

  const signOut = useCallback(async () => {
    if (isSupabaseConfigured()) {
      await getSupabase().auth.signOut()
    }
    setSession(null)
    setStatus("password")
  }, [])

  useEffect(() => {
    // Synchronize with an external system (Supabase auth). State updates happen
    // asynchronously inside refresh() after awaits, and via the subscription.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh()
    if (!isSupabaseConfigured()) return
    const supabase = getSupabase()
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      refresh()
    })
    return () => subscription.unsubscribe()
  }, [refresh])

  return (
    <AuthContext.Provider value={{ status, session, refresh, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}
