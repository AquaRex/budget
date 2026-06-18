"use client"

import { Loader2 } from "lucide-react"

import { useAuth } from "@/components/auth/auth-provider"
import { PasswordForm } from "@/components/auth/password-form"
import { MfaEnroll } from "@/components/auth/mfa-enroll"
import { MfaChallenge } from "@/components/auth/mfa-challenge"
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert"

/**
 * Gates the entire app. Children (the real app + any data) are only mounted
 * once the user has reached aal2 (password + verified TOTP). Before that, no
 * Supabase data query runs, and even if one did, RLS returns zero rows.
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const { status } = useAuth()

  if (status === "ready") return <>{children}</>

  return (
    <div className="bg-muted/40 flex min-h-svh items-center justify-center p-4">
      {status === "loading" && (
        <Loader2 className="text-muted-foreground size-6 animate-spin" />
      )}
      {status === "unconfigured" && (
        <Alert variant="destructive" className="max-w-md">
          <AlertTitle>Supabase is not configured</AlertTitle>
          <AlertDescription>
            Copy <code>.env.local.example</code> to <code>.env.local</code> and
            set <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code>, then restart the dev
            server.
          </AlertDescription>
        </Alert>
      )}
      {status === "password" && <PasswordForm />}
      {status === "enroll" && <MfaEnroll />}
      {status === "challenge" && <MfaChallenge />}
    </div>
  )
}
