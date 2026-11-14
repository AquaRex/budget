"use client"

import { useEffect, useState } from "react"
import { Eye, EyeOff, Pencil, Plus } from "lucide-react"
import { toast } from "sonner"

import type { AccountBalance } from "@/lib/bank-balances"
import {
  type CardNetwork,
  type CardSecret,
  type PaymentCard,
  type PaymentCardInput,
  deleteCard,
  getCardSecret,
  saveCard,
  setCardSecret,
  useAccountLabel,
  useCards,
} from "@/lib/data/accounts"
import { getDemoMode } from "@/lib/demo-mode"
import { errMessage } from "@/lib/errors"
import { formatNOK } from "@/lib/format"
import { accountFromKey } from "@/lib/reconcile"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Panel } from "@/components/stats/panel"

const NETWORKS: { value: CardNetwork; label: string }[] = [
  { value: "visa", label: "Visa" },
  { value: "mastercard", label: "Mastercard" },
  { value: "amex", label: "American Express" },
  { value: "other", label: "Other" },
]

/** Your cards, each showing what's really available on the account it uses. */
export function PaymentCards({ accounts }: { accounts: AccountBalance[] }) {
  const { data: cards } = useCards()
  const [editing, setEditing] = useState<PaymentCard | "new" | null>(null)

  return (
    <Panel
      title="Cards"
      action={
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Add card"
          onClick={() => setEditing("new")}
        >
          <Plus className="size-4" />
        </Button>
      }
    >
      {!cards?.length ? (
        <button
          type="button"
          onClick={() => setEditing("new")}
          className="text-muted-foreground hover:text-foreground w-full border border-dashed p-6 text-center text-sm"
        >
          Add a card to see its balance here
        </button>
      ) : (
        <div className="flex flex-col gap-3">
          {cards.map((c) => (
            <CardTile
              key={c.id}
              card={c}
              account={accounts.find(
                (a) => accountFromKey(a.accountKey) === c.account_number,
              )}
              onEdit={() => setEditing(c)}
            />
          ))}
        </div>
      )}
      {editing && (
        <CardDialog
          card={editing === "new" ? null : editing}
          accounts={accounts}
          onClose={() => setEditing(null)}
        />
      )}
    </Panel>
  )
}

function CardTile({
  card,
  account,
  onEdit,
}: {
  card: PaymentCard
  account: AccountBalance | undefined
  onEdit: () => void
}) {
  const [secret, setSecret] = useState<CardSecret | null>(null)
  const [loading, setLoading] = useState(false)
  const shown = secret !== null
  const label = useAccountLabel()
  const network = NETWORKS.find((n) => n.value === card.network)?.label

  // Hide again automatically after a minute.
  useEffect(() => {
    if (!secret) return
    const t = setTimeout(() => setSecret(null), 60_000)
    return () => clearTimeout(t)
  }, [secret])

  async function toggle() {
    if (shown) {
      setSecret(null)
      return
    }
    if (getDemoMode() !== "off") {
      toast.info("Card details stay hidden while demo mode is on.")
      return
    }
    setLoading(true)
    try {
      setSecret(await getCardSecret(card.id))
    } catch (e) {
      toast.error(errMessage(e, "Could not show the card details."))
    } finally {
      setLoading(false)
    }
  }

  const number = secret?.number
    ? secret.number.replace(/(\d{4})(?=\d)/g, "$1 ")
    : `•••• •••• •••• ${shown ? (card.last4 ?? "????") : "••••"}`

  return (
    <div
      className={cn(
        "relative flex aspect-[1.586] max-w-sm flex-col justify-between overflow-hidden p-4 text-white shadow-sm",
        card.network === "mastercard"
          ? "bg-gradient-to-br from-zinc-800 to-zinc-950"
          : card.network === "amex"
            ? "bg-gradient-to-br from-sky-700 to-sky-950"
            : "bg-gradient-to-br from-indigo-700 to-indigo-950",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{card.name}</div>
          {card.account_number && (
            <div className="truncate text-[11px] text-white/70">
              {label(card.account_number) ??
                `Account …${card.account_number.slice(-4)}`}
            </div>
          )}
        </div>
        <div className="flex shrink-0 gap-0.5">
          <Button
            size="icon-sm"
            variant="ghost"
            className="text-white hover:bg-white/15 hover:text-white"
            aria-label={shown ? "Hide card details" : "Show card details"}
            disabled={loading}
            onClick={toggle}
          >
            {shown ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            className="text-white hover:bg-white/15 hover:text-white"
            aria-label="Edit card"
            onClick={onEdit}
          >
            <Pencil className="size-3.5" />
          </Button>
        </div>
      </div>

      {/* Chip */}
      <div className="h-6 w-8 rounded-sm bg-gradient-to-br from-amber-200 to-amber-500" />

      <div className="flex items-end justify-between gap-3">
        <div className="font-mono text-sm tracking-widest tabular-nums">
          {number}
          <div className="mt-1 flex gap-3 text-[11px] tracking-normal text-white/70">
            <span>{shown ? (card.expiry ?? "--/--") : "••/••"}</span>
            {shown && secret?.cvc && <span>CVC {secret.cvc}</span>}
            {shown && secret?.pin && <span>PIN {secret.pin}</span>}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] tracking-wider text-white/70 uppercase">
            {network ?? ""}
          </div>
          <div className="text-lg font-semibold tabular-nums">
            {account?.real != null ? formatNOK(account.real, true) : "—"}
          </div>
        </div>
      </div>
    </div>
  )
}

function CardDialog({
  card,
  accounts,
  onClose,
}: {
  card: PaymentCard | null
  accounts: AccountBalance[]
  onClose: () => void
}) {
  const label = useAccountLabel()
  const [form, setForm] = useState<PaymentCardInput>({
    name: card?.name ?? "",
    network: card?.network ?? "visa",
    last4: card?.last4 ?? "",
    expiry: card?.expiry ?? "",
    account_number: card?.account_number ?? "",
  })
  const [secret, setSecretForm] = useState<CardSecret>({
    number: "",
    cvc: "",
    pin: "",
  })
  const [busy, setBusy] = useState(false)
  const set = (patch: Partial<PaymentCardInput>) =>
    setForm((f) => ({ ...f, ...patch }))
  const onlyDigits = (v: string, max: number) =>
    v.replace(/\D/g, "").slice(0, max)

  const numberOk = !secret.number || /^\d{12,19}$/.test(secret.number)
  const cvcOk = !secret.cvc || /^\d{3,4}$/.test(secret.cvc)
  const pinOk = !secret.pin || /^\d{4,6}$/.test(secret.pin)

  const last4Ok = !form.last4 || /^\d{4}$/.test(form.last4)
  const expiryOk = !form.expiry || /^(0[1-9]|1[0-2])\/\d{2}$/.test(form.expiry)
  const valid =
    form.name.trim() && last4Ok && expiryOk && numberOk && cvcOk && pinOk

  async function save() {
    setBusy(true)
    try {
      const id = await saveCard(form, card?.id)
      if (secret.number || secret.cvc || secret.pin) {
        await setCardSecret(id, secret)
      }
      onClose()
    } catch (e) {
      toast.error(errMessage(e, "Could not save the card."))
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (
      !card ||
      !confirm(`Remove the card "${card.name}" from the dashboard?`)
    ) {
      return
    }
    setBusy(true)
    try {
      await deleteCard(card.id)
      onClose()
    } catch (e) {
      toast.error(errMessage(e, "Could not remove the card."))
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{card ? "Edit card" : "Add card"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="card-name">Name</Label>
            <Input
              id="card-name"
              value={form.name}
              maxLength={60}
              placeholder="e.g. Visa"
              onChange={(e) => set({ name: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Network</Label>
              <Select
                value={form.network ?? "visa"}
                onValueChange={(v) => set({ network: v as CardNetwork })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {NETWORKS.map((n) => (
                    <SelectItem key={n.value} value={n.value}>
                      {n.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Uses account</Label>
              <Select
                value={form.account_number ?? ""}
                onValueChange={(v) => set({ account_number: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => {
                    const acct = accountFromKey(a.accountKey)
                    return (
                      <SelectItem key={acct} value={acct}>
                        {label(acct) ?? `Account …${acct.slice(-4)}`}
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="card-last4">Last 4 digits</Label>
              <Input
                id="card-last4"
                inputMode="numeric"
                maxLength={4}
                value={form.last4 ?? ""}
                aria-invalid={!last4Ok}
                onChange={(e) =>
                  set({ last4: e.target.value.replace(/\D/g, "").slice(0, 4) })
                }
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="card-expiry">Expiry (MM/YY)</Label>
              <Input
                id="card-expiry"
                inputMode="numeric"
                maxLength={5}
                placeholder="08/29"
                value={form.expiry ?? ""}
                aria-invalid={!expiryOk}
                onChange={(e) => {
                  const d = e.target.value.replace(/\D/g, "").slice(0, 4)
                  set({
                    expiry: d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d,
                  })
                }}
              />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="card-number">Full card number</Label>
            <Input
              id="card-number"
              type="password"
              autoComplete="off"
              inputMode="numeric"
              placeholder={card?.secret_id ? "Saved — leave empty to keep" : ""}
              value={secret.number}
              aria-invalid={!numberOk}
              onChange={(e) =>
                setSecretForm((s) => ({
                  ...s,
                  number: onlyDigits(e.target.value, 19),
                }))
              }
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="card-cvc">CVC</Label>
              <Input
                id="card-cvc"
                type="password"
                autoComplete="off"
                inputMode="numeric"
                placeholder={card?.secret_id ? "Leave empty to keep" : ""}
                value={secret.cvc}
                aria-invalid={!cvcOk}
                onChange={(e) =>
                  setSecretForm((s) => ({
                    ...s,
                    cvc: onlyDigits(e.target.value, 4),
                  }))
                }
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="card-pin">PIN</Label>
              <Input
                id="card-pin"
                type="password"
                autoComplete="off"
                inputMode="numeric"
                placeholder={card?.secret_id ? "Leave empty to keep" : ""}
                value={secret.pin}
                aria-invalid={!pinOk}
                onChange={(e) =>
                  setSecretForm((s) => ({
                    ...s,
                    pin: onlyDigits(e.target.value, 6),
                  }))
                }
              />
            </div>
          </div>
          <p className="text-muted-foreground text-xs">
            Card number, CVC and PIN are stored encrypted in Supabase Vault and
            only decrypted when you click the eye icon (signed in with 2FA).
          </p>
        </div>
        <DialogFooter className="gap-2">
          {card && (
            <Button
              variant="ghost"
              className="text-destructive mr-auto"
              disabled={busy}
              onClick={remove}
            >
              Remove
            </Button>
          )}
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={save} disabled={!valid || busy}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
