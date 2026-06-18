"use client"

import { useEffect, useState } from "react"
import { ShieldCheck } from "lucide-react"

import { getSupabase } from "@/lib/supabase/client"
import { useAuth } from "@/components/auth/auth-provider"
import { OtpField } from "@/components/auth/otp-field"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export function MfaChallenge() {
  const { refresh, signOut } = useAuth()
  const [factorId, setFactorId] = useState<string | null>(null)
  const [code, setCode] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Find the verified TOTP factor to challenge.
  useEffect(() => {
    let cancelled = false
    async function load() {
      const { data } = await getSupabase().auth.mfa.listFactors()
      const totp = (data?.totp ?? []).find((f) => f.status === "verified")
      if (!cancelled) setFactorId(totp?.id ?? null)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  async function verify(value: string) {
    if (!factorId || value.length !== 6) return
    setLoading(true)
    setError(null)
    try {
      const { error } = await getSupabase().auth.mfa.challengeAndVerify({
        factorId,
        code: value,
      })
      if (error) {
        setError("That code didn't match. Try the current 6 digits.")
        setCode("")
        return
      }
      await refresh()
    } catch {
      setError("Verification failed. Please try again.")
      setCode("")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="text-center">
        <div className="bg-primary/10 text-primary mx-auto mb-2 flex size-11 items-center justify-center rounded-full">
          <ShieldCheck className="size-5" />
        </div>
        <CardTitle>Two-factor code</CardTitle>
        <CardDescription>
          Enter the 6-digit code from your authenticator app.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-4">
        <OtpField
          value={code}
          onChange={setCode}
          onComplete={verify}
          disabled={loading || !factorId}
        />
        {error && <p className="text-destructive text-sm">{error}</p>}
      </CardContent>
      <CardFooter className="flex flex-col gap-2">
        <Button
          className="w-full"
          onClick={() => verify(code)}
          disabled={loading || code.length !== 6}
        >
          {loading ? "Verifying…" : "Verify"}
        </Button>
        <Button variant="ghost" className="w-full" onClick={signOut}>
          Use a different account
        </Button>
      </CardFooter>
    </Card>
  )
}
