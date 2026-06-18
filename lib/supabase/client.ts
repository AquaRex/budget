import { createClient, type SupabaseClient } from "@supabase/supabase-js"

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

// A single browser client, reused across the app. The session (incl. MFA state)
// is persisted in localStorage by supabase-js.
let client: SupabaseClient | null = null

export function getSupabase(): SupabaseClient {
  if (!url || !anonKey) {
    throw new Error(
      "Missing Supabase env vars. Copy .env.local.example to .env.local and set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    )
  }
  if (!client) {
    client = createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    })
  }
  return client
}

export const AUTH_EMAIL = process.env.NEXT_PUBLIC_AUTH_EMAIL || ""

export function isSupabaseConfigured(): boolean {
  return Boolean(url && anonKey)
}
