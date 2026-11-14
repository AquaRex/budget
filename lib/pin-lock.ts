// PIN lock: a quick privacy screen in front of an already signed-in session
// (password + 2FA still guard the account itself). The PIN is stored as a
// salted PBKDF2 hash in the Supabase user's metadata, so it follows the
// account to every device. Fingerprint / face unlock is a per-device WebAuthn
// credential: the device only returns an assertion after it has verified the
// user, which is all a client-side lock can check.
import { useMemo, useSyncExternalStore } from "react"
import type { User } from "@supabase/supabase-js"

import { getSupabase } from "@/lib/supabase/client"

export const PIN_MIN = 4
export const PIN_MAX = 12

export type PinRecord = { v: 1; salt: string; hash: string; len: number }

const META_KEY = "pin_lock"
const ITERATIONS = 150_000

function toB64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
}

function fromB64(s: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0))
}

export function getPinRecord(user: User | null | undefined): PinRecord | null {
  const r = user?.user_metadata?.[META_KEY]
  return r && r.v === 1 && r.salt && r.hash && r.len ? (r as PinRecord) : null
}

async function hashPin(pin: string, salt: Uint8Array<ArrayBuffer>) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(pin),
    "PBKDF2",
    false,
    ["deriveBits"],
  )
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: ITERATIONS },
    key,
    256,
  )
  return toB64(new Uint8Array(bits))
}

export async function verifyPin(pin: string, rec: PinRecord) {
  if (pin.length !== rec.len) {
    return false
  }
  const h = await hashPin(pin, fromB64(rec.salt))
  let diff = h.length ^ rec.hash.length
  for (let i = 0; i < h.length; i++) {
    diff |= h.charCodeAt(i) ^ rec.hash.charCodeAt(i)
  }
  return diff === 0
}

/** Save a new PIN (or remove it with null) on the account. */
export async function savePin(pin: string | null): Promise<void> {
  let rec: PinRecord | null = null
  if (pin) {
    const salt = crypto.getRandomValues(new Uint8Array(16))
    rec = {
      v: 1,
      salt: toB64(salt),
      hash: await hashPin(pin, salt),
      len: pin.length,
    }
  }
  const { data, error } = await getSupabase().auth.updateUser({
    data: { [META_KEY]: rec },
  })
  if (error) {
    throw error
  }
  writeCache(data.user)
}

// --- Device copy of the PIN record ------------------------------------------
// The signed-in session's user can be up to an hour old, so a PIN set on
// another device wouldn't show up yet. Each device keeps the last record it
// fetched fresh from Supabase (on open, and after saving), and that wins over
// the session's copy.

const CACHE_KEY = "budget.pinRecord"
const cacheListeners = new Set<() => void>()

function cacheRaw(): string | null {
  try {
    return localStorage.getItem(CACHE_KEY)
  } catch {
    return null
  }
}

function writeCache(user: User): void {
  try {
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ user: user.id, rec: getPinRecord(user) }),
    )
  } catch {
    // Storage blocked: the session's copy is used instead.
  }
  cacheListeners.forEach((l) => l())
}

function subscribeCache(l: () => void): () => void {
  cacheListeners.add(l)
  return () => cacheListeners.delete(l)
}

/** The PIN record for this user: the device copy if any, else the session's. */
export function usePinRecord(user: User | null | undefined): PinRecord | null {
  const raw = useSyncExternalStore(subscribeCache, cacheRaw, () => null)
  return useMemo(() => {
    if (!user) {
      return null
    }
    try {
      const c = JSON.parse(raw ?? "")
      if (c.user === user.id) {
        return c.rec && c.rec.v === 1 ? (c.rec as PinRecord) : null
      }
    } catch {
      // No device copy yet.
    }
    return getPinRecord(user)
  }, [raw, user])
}

/** Fetch the user fresh from Supabase and update the device copy. */
export async function refreshPinRecord(): Promise<PinRecord | null> {
  const { data, error } = await getSupabase().auth.getUser()
  if (error || !data.user) {
    throw error ?? new Error("No user")
  }
  writeCache(data.user)
  return getPinRecord(data.user)
}

// --- Wrong-PIN cooldown (per device) ---------------------------------------

const FAILS_KEY = "budget.pinFails"
const FREE_TRIES = 5

type Fails = { count: number; until: number }

function readFails(): Fails {
  try {
    const f = JSON.parse(localStorage.getItem(FAILS_KEY) ?? "")
    return { count: Number(f.count) || 0, until: Number(f.until) || 0 }
  } catch {
    return { count: 0, until: 0 }
  }
}

/** Epoch ms until which entry is paused (0 when free). */
export function pinCooldownUntil(): number {
  const { until } = readFails()
  return until > Date.now() ? until : 0
}

/** Record a wrong PIN; from the 5th on, each pauses entry for 30s, 60s, … */
export function recordPinFailure(): number {
  const f = readFails()
  f.count += 1
  if (f.count >= FREE_TRIES) {
    f.until = Date.now() + 30_000 * (f.count - FREE_TRIES + 1)
  }
  localStorage.setItem(FAILS_KEY, JSON.stringify(f))
  return f.until > Date.now() ? f.until : 0
}

export function clearPinFailures(): void {
  localStorage.removeItem(FAILS_KEY)
}

// --- Fingerprint / face (WebAuthn platform authenticator) ------------------

const BIO_KEY = "budget.pinBiometric"

type BioRecord = { id: string; user: string }

function readBio(userId: string): BioRecord | null {
  try {
    const b = JSON.parse(localStorage.getItem(BIO_KEY) ?? "") as BioRecord
    return b.id && b.user === userId ? b : null
  } catch {
    return null
  }
}

export function hasBiometric(userId: string): boolean {
  return typeof window !== "undefined" && readBio(userId) !== null
}

export async function biometricSupported(): Promise<boolean> {
  try {
    return (
      typeof window !== "undefined" &&
      window.isSecureContext &&
      !!window.PublicKeyCredential &&
      (await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable())
    )
  } catch {
    return false
  }
}

/** Register this device's fingerprint / face sensor. Needs a user tap. */
export async function enrollBiometric(userId: string): Promise<void> {
  const cred = (await navigator.credentials.create({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rp: { name: "Budget" },
      user: {
        id: crypto.getRandomValues(new Uint8Array(16)),
        name: "Budget PIN lock",
        displayName: "Budget PIN lock",
      },
      pubKeyCredParams: [
        { type: "public-key", alg: -7 },
        { type: "public-key", alg: -257 },
      ],
      authenticatorSelection: {
        authenticatorAttachment: "platform",
        userVerification: "required",
        residentKey: "discouraged",
      },
      attestation: "none",
      timeout: 60_000,
    },
  })) as PublicKeyCredential | null
  if (!cred) {
    throw new Error("No credential was created")
  }
  localStorage.setItem(
    BIO_KEY,
    JSON.stringify({ id: toB64(new Uint8Array(cred.rawId)), user: userId }),
  )
}

export function removeBiometric(): void {
  localStorage.removeItem(BIO_KEY)
}

/** Ask the device to verify the user; true only if it did (UV flag set). */
export async function verifyBiometric(userId: string): Promise<boolean> {
  const bio = readBio(userId)
  if (!bio) {
    return false
  }
  const cred = (await navigator.credentials.get({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      allowCredentials: [
        { type: "public-key", id: fromB64(bio.id), transports: ["internal"] },
      ],
      userVerification: "required",
      timeout: 60_000,
    },
  })) as PublicKeyCredential | null
  if (!cred) {
    return false
  }
  const data = new Uint8Array(
    (cred.response as AuthenticatorAssertionResponse).authenticatorData,
  )
  // Flags byte (index 32): bit 2 = user verified.
  return data.length > 32 && (data[32] & 0x04) !== 0
}
