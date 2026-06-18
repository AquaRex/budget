"use client"

import { useState } from "react"
import { Lock } from "lucide-react"

import { AUTH_EMAIL, getSupabase } from "@/lib/supabase/client"
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
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const { error } = await getSupabase().auth.signInWithPassword({
        email: AUTH_EMAIL,
        password,
      })
      if (error) {
        setError("Incorrect password.")
        return
      }
      // onAuthStateChange in the provider will advance the flow, but refresh
      // immediately so the MFA step appears without delay.
      await refresh()
    } catch {
      setError("Something went wrong. Check your connection and try again.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="text-center">
        <div className="bg-primary/10 text-primary mx-auto mb-2 flex size-11 items-center justify-center rounded-full">
          <Lock className="size-5" />
        </div>
        <CardTitle>Budget</CardTitle>
        <CardDescription>Enter your password to continue.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
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
          <Button type="submit" disabled={loading || !password}>
            {loading ? "Signing in…" : "Continue"}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
