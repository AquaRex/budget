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

export function MfaEnroll() {
  const { refresh, signOut } = useAuth()
  const [factorId, setFactorId] = useState<string | null>(null)
  const [qr, setQr] = useState<string | null>(null)
  const [secret, setSecret] = useState<string | null>(null)
  const [code, setCode] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Start enrollment: clean up any half-finished factor, then enroll a fresh one.
  useEffect(() => {
    let cancelled = false
    async function start() {
      setError(null)
      const supabase = getSupabase()
      try {
        const { data: list } = await supabase.auth.mfa.listFactors()
        const stale = (list?.all ?? []).filter(
          (f) => f.factor_type === "totp" && f.status === "unverified",
        )
        for (const f of stale) {
          await supabase.auth.mfa.unenroll({ factorId: f.id })
        }

        const { data, error } = await supabase.auth.mfa.enroll({
          factorType: "totp",
          friendlyName: `Authenticator ${Date.now()}`,
        })
        if (error) throw error
        if (cancelled) return
        setFactorId(data.id)
        setQr(data.totp.qr_code)
        setSecret(data.totp.secret)
      } catch (e) {
        if (!cancelled)
          setError(
            e instanceof Error ? e.message : "Could not start MFA enrollment.",
          )
      }
    }
    start()
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
        <CardTitle>Set up two-factor</CardTitle>
        <CardDescription>
          Scan this QR code with Google Authenticator, then enter the 6-digit
          code to finish.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-4">
        {qr ? (
          // qr_code is an inline SVG data URL returned by Supabase.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={qr}
            alt="TOTP QR code"
            className="size-44 rounded-md border bg-white p-2"
          />
        ) : (
          <div className="bg-muted size-44 animate-pulse rounded-md" />
        )}
        {secret && (
          <p className="text-muted-foreground text-center text-xs">
            Or enter this key manually:
            <br />
            <code className="text-foreground break-all">{secret}</code>
          </p>
        )}
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
          {loading ? "Verifying…" : "Verify & continue"}
        </Button>
        <Button variant="ghost" className="w-full" onClick={signOut}>
          Cancel
        </Button>
      </CardFooter>
    </Card>
  )
}
