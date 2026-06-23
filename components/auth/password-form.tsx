"use client"

import { useState } from "react"
import { Lock, Play } from "lucide-react"

import {
  AUTH_EMAIL,
  DEMO_EMAIL,
  DEMO_PASSWORD,
  getSupabase,
} from "@/lib/supabase/client"
import { useAuth } from "@/components/auth/auth-provider"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export function PasswordForm() {
  const { refresh } = useAuth()
  const [email, setEmail] = useState(AUTH_EMAIL)
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function signIn(em: string, pw: string) {
    setError(null)
    setLoading(true)
    try {
      const { error } = await getSupabase().auth.signInWithPassword({
        email: em.trim(),
        password: pw,
      })
      if (error) {
        setError("Incorrect email or password.")
        return
      }
      // onAuthStateChange advances the flow, but refresh immediately so the
      // next step (MFA, or the app for the demo) appears without delay.
      await refresh()
    } catch {
      setError("Something went wrong. Check your connection and try again.")
    } finally {
      setLoading(false)
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    await signIn(email, password)
  }

  function onDemo() {
    if (DEMO_PASSWORD) {
      void signIn(DEMO_EMAIL, DEMO_PASSWORD)
    } else {
      // No demo password configured: pre-fill the email so it's one field away.
      setEmail(DEMO_EMAIL)
      setPassword("")
      setError(null)
    }
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="text-center">
        <div className="bg-primary/10 text-primary mx-auto mb-2 flex size-11 items-center justify-center rounded-full">
          <Lock className="size-5" />
        </div>
        <CardTitle>Budget</CardTitle>
        <CardDescription>Sign in to continue.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoFocus
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error && <p className="text-destructive text-sm">{error}</p>}
          <Button type="submit" disabled={loading || !email || !password}>
            {loading ? "Signing in…" : "Continue"}
          </Button>
        </form>

        <button
          type="button"
          onClick={onDemo}
          disabled={loading}
          className="text-muted-foreground hover:text-foreground inline-flex items-center justify-center gap-1.5 text-sm"
        >
          <Play className="size-3.5" />
          View demo
        </button>
      </CardContent>
    </Card>
  )
}
