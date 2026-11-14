"use client"

import { useCallback, useMemo } from "react"
import useSWR, { mutate } from "swr"

import { useStoredTransactions } from "@/lib/data/use-budget"
import { digits } from "@/lib/reconcile"
import { getSupabase } from "@/lib/supabase/client"
import type { Transaction } from "@/lib/types"

// ---------------------------------------------------------------- account names

export type AccountName = { account_number: string; name: string }

async function fetchAccountNames(): Promise<AccountName[]> {
  const { data, error } = await getSupabase()
    .from("account_names")
    .select("account_number, name")
  if (error) throw error
  return (data ?? []) as AccountName[]
}

export function useAccountNames() {
  return useSWR("account_names", fetchAccountNames)
}

/** Set (or, with an empty name, remove) your name for an account. */
export async function saveAccountName(accountNumber: string, name: string) {
  const supabase = getSupabase()
  const trimmed = name.trim()
  if (!trimmed) {
    const { error } = await supabase
      .from("account_names")
      .delete()
      .eq("account_number", accountNumber)
    if (error) throw error
  } else {
    const { error } = await supabase
      .from("account_names")
      .upsert(
        { account_number: accountNumber, name: trimmed },
        { onConflict: "user_id,account_number" },
      )
    if (error) throw error
  }
  await mutate("account_names")
}

/**
 * Account names learned from your own transfers: "Overført fra: Buffer" on a
 * row whose from_account is 3626…5021 means that account is called "Buffer".
 * Most frequent name per account wins.
 */
export function suggestAccountNames(txs: Transaction[]): Map<string, string> {
  const votes = new Map<string, Map<string, number>>()
  for (const t of txs) {
    const m = /^Overført (fra|til):\s*(.+?)\.?\s*$/i.exec(t.description ?? "")
    if (!m) continue
    const acct = digits(
      m[1].toLowerCase() === "fra" ? t.from_account : t.to_account,
    )
    if (acct.length !== 11) continue
    const name = m[2].trim()
    const v = votes.get(acct) ?? new Map<string, number>()
    v.set(name, (v.get(name) ?? 0) + 1)
    votes.set(acct, v)
  }
  const out = new Map<string, string>()
  for (const [acct, v] of votes) {
    out.set(acct, [...v.entries()].sort((a, b) => b[1] - a[1])[0][0])
  }
  return out
}

// ---------------------------------------------------------------- cards

export type CardNetwork = "visa" | "mastercard" | "amex" | "other"

export type PaymentCard = {
  id: string
  name: string
  network: CardNetwork | null
  last4: string | null
  expiry: string | null // "MM/YY"
  account_number: string | null
  sort_order: number
  /** Set when full number/CVC/PIN are saved (encrypted in Vault). */
  secret_id: string | null
}

export type PaymentCardInput = Omit<
  PaymentCard,
  "id" | "sort_order" | "secret_id"
>

async function fetchCards(): Promise<PaymentCard[]> {
  const { data, error } = await getSupabase()
    .from("payment_cards")
    .select(
      "id, name, network, last4, expiry, account_number, sort_order, secret_id",
    )
    .order("sort_order")
    .order("created_at")
  if (error) throw error
  return (data ?? []) as PaymentCard[]
}

export function useCards() {
  return useSWR("payment_cards", fetchCards)
}

/** Save a card's display details. Returns its id. */
export async function saveCard(
  input: PaymentCardInput,
  id?: string,
): Promise<string> {
  const supabase = getSupabase()
  const row = {
    name: input.name.trim(),
    network: input.network,
    last4: input.last4 || null,
    expiry: input.expiry || null,
    account_number: input.account_number || null,
  }
  if (id) {
    const { error } = await supabase
      .from("payment_cards")
      .update(row)
      .eq("id", id)
    if (error) throw error
  } else {
    const { data, error } = await supabase
      .from("payment_cards")
      .insert(row)
      .select("id")
      .single()
    if (error) throw error
    id = data.id as string
  }
  await mutate("payment_cards")
  return id!
}

export type CardSecret = { number?: string; cvc?: string; pin?: string }

/** Store full number / CVC / PIN encrypted in Supabase Vault (blank = keep). */
export async function setCardSecret(cardId: string, s: CardSecret) {
  const { error } = await getSupabase().rpc("set_card_secret", {
    p_card_id: cardId,
    p_number: s.number || null,
    p_cvc: s.cvc || null,
    p_pin: s.pin || null,
  })
  if (error) throw error
  await mutate("payment_cards")
}

/** Decrypt a card's secret details — only called when you click the eye. */
export async function getCardSecret(cardId: string): Promise<CardSecret> {
  const { data, error } = await getSupabase().rpc("get_card_secret", {
    p_card_id: cardId,
  })
  if (error) throw error
  return (data ?? {}) as CardSecret
}

export async function deleteCard(id: string) {
  const { error } = await getSupabase()
    .from("payment_cards")
    .delete()
    .eq("id", id)
  if (error) throw error
  await mutate("payment_cards")
}

/**
 * Display name for an 11-digit account number: your own name for it, else one
 * learned from your transfers, else null.
 */
export function useAccountLabel(): (accountNumber: string) => string | null {
  const { data: names } = useAccountNames()
  const { transactions } = useStoredTransactions()
  const suggested = useMemo(
    () => suggestAccountNames(transactions),
    [transactions],
  )
  return useCallback(
    (acct: string) =>
      names?.find((n) => n.account_number === acct)?.name ??
      suggested.get(acct) ??
      null,
    [names, suggested],
  )
}
