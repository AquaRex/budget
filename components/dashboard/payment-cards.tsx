"use client"

import { useEffect, useRef, useState } from "react"
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
import { MASK, getDemoMode, useDemoMode } from "@/lib/demo-mode"
import { errMessage } from "@/lib/errors"
import { formatNOK } from "@/lib/format"
import { accountFromKey } from "@/lib/reconcile"
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
import FlipCard from "@/components/FlipCard"
import ReflectiveCard from "@/components/ReflectiveCard"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  CheckmarkBadge01Icon,
  FingerPrintIcon,
} from "@hugeicons/core-free-icons"

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
  const demo = useDemoMode() !== "off"

  return (
    <Panel
      title="Cards"
      action={
        demo ? undefined : (
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="Add card"
            onClick={() => setEditing("new")}
          >
            <Plus className="size-4" />
          </Button>
        )
      }
    >
      {!cards?.length ? (
        demo ? (
          <p className="text-muted-foreground text-sm">No cards added.</p>
        ) : (
          <button
            type="button"
            onClick={() => setEditing("new")}
            className="text-muted-foreground hover:text-foreground w-full border border-dashed p-6 text-center text-sm"
          >
            Add a card to see its balance here
          </button>
        )
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

/** Keeps a press on a button inside the card from flipping or dragging it. */
function NoFlip({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="flex shrink-0 gap-0.5"
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      {children}
    </span>
  )
}

/** Width that fits the panel (cards are fixed-size components), max 420px. */
function useFitWidth(max: number) {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(max)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) =>
      setWidth(Math.max(240, Math.min(max, Math.floor(e.contentRect.width)))),
    )
    ro.observe(el)
    return () => ro.disconnect()
  }, [max])
  return { ref, width }
}

const iconBtn = "text-white/80 hover:bg-white/15 hover:text-white"

function CardTile({
  card,
  account,
  onEdit,
}: {
  card: PaymentCard
  account: AccountBalance | undefined
  onEdit: () => void
}) {
  const demo = useDemoMode() !== "off"
  const [secret, setSecret] = useState<CardSecret | null>(null)
  const [loading, setLoading] = useState(false)
  const shown = secret !== null && !demo
  const label = useAccountLabel()
  const network = NETWORKS.find((n) => n.value === card.network)?.label
  const { ref, width } = useFitWidth(420)
  const height = Math.round(width / 1.51) // the reference card, turned sideways

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

  const accountName = card.account_number
    ? (label(card.account_number) ??
      `Account …${card.account_number.slice(-4)}`)
    : null
  const groups = (n: string) => n.replace(/(\d{4})(?=\d)/g, "$1 ")

  // Your React Bits settings ("Studio" = no video: it reflects a soft studio).
  // Radius 40 at full width, scaled down with the card on narrow screens.
  const radius = Math.round((40 * width) / 420)
  const surface = {
    width,
    height,
    radius,
    webcam: false, // never use the camera
    tint: "#ffffff",
    metalness: 1,
    roughness: 0.4,
    blurStrength: 10.5,
    shine: 1.35,
    glare: 0.3,
    warpScale: 3,
    bevel: 4.5,
    enableTilt: true, // the reflective card does the tilting
    tiltStrength: 16,
  }

  const header = (
    <div className="reflective-card__header">
      <span className="reflective-card__badge">
        <HugeiconsIcon
          icon={CheckmarkBadge01Icon}
          size={16}
          strokeWidth={1.8}
        />
        Verified
      </span>
      <span className="reflective-card__status">
        <span className="reflective-card__dot" />
        Active
      </span>
    </div>
  )

  const front = (
    <ReflectiveCard {...surface}>
      {header}
      <div className="reflective-card__identity">
        <GoldChip />
        <h3 className="reflective-card__name mt-6 truncate">{card.name}</h3>
        {accountName && (
          <p className="reflective-card__role truncate">{accountName}</p>
        )}
      </div>
      <div className="reflective-card__footer !mt-4">
        <div className="reflective-card__id">
          <span className="reflective-card__label">Card number</span>
          <span className="reflective-card__value">
            •••• •••• •••• {card.last4 ?? "••••"}
          </span>
        </div>
        <div className="reflective-card__id ml-auto text-right">
          <span className="reflective-card__label">
            {network ? `${network} · ` : ""}Available
          </span>
          <span className="reflective-card__value">
            {demo
              ? `${MASK} kr`
              : account?.real != null
                ? formatNOK(account.real, true)
                : "—"}
          </span>
        </div>
        <span className="reflective-card__tile">
          <HugeiconsIcon icon={FingerPrintIcon} size={22} strokeWidth={1.6} />
        </span>
      </div>
    </ReflectiveCard>
  )

  const back = (
    <ReflectiveCard {...surface}>
      <div className="-mx-(--rc-pad) h-10 bg-black/75" aria-hidden />
      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="reflective-card__label">Card details</span>
        {!demo && (
          <NoFlip>
            <Button
              size="icon-sm"
              variant="ghost"
              className={iconBtn}
              aria-label={shown ? "Hide card details" : "Show card details"}
              disabled={loading}
              onClick={toggle}
            >
              {shown ? (
                <EyeOff className="size-4" />
              ) : (
                <Eye className="size-4" />
              )}
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              className={iconBtn}
              aria-label="Edit card"
              onClick={onEdit}
            >
              <Pencil className="size-3.5" />
            </Button>
          </NoFlip>
        )}
      </div>
      <div className="mt-auto flex flex-col gap-3">
        <div className="reflective-card__id">
          <span className="reflective-card__label">Card number</span>
          <span className="reflective-card__value !text-lg">
            {shown && secret?.number
              ? groups(secret.number)
              : `•••• •••• •••• ${shown ? (card.last4 ?? "••••") : "••••"}`}
          </span>
        </div>
        <div className="flex gap-6">
          <Field k="Expires" v={shown ? (card.expiry ?? "—") : "••/••"} />
          <Field k="CVC" v={shown ? (secret?.cvc ?? "—") : "•••"} />
          <Field k="PIN" v={shown ? (secret?.pin ?? "—") : "••••"} />
        </div>
      </div>
    </ReflectiveCard>
  )

  return (
    <div ref={ref} className="w-full max-w-[420px]">
      <FlipCard
        front={front}
        back={back}
        width={width}
        height={height}
        radius={radius}
        background="transparent"
        // FlipCard only flips; tilt, glare and shadow come from ReflectiveCard.
        tilt={false}
        glare={false}
        shadow={false}
        hoverScale={1}
        ariaLabel={`Flip card ${card.name}`}
        onFlipChange={(b: boolean) => {
          if (!b) setSecret(null) // hide details when turned back over
        }}
      />
    </div>
  )
}

function Field({ k, v }: { k: string; v: string }) {
  return (
    <div className="reflective-card__id">
      <span className="reflective-card__label">{k}</span>
      <span className="reflective-card__value">{v}</span>
    </div>
  )
}

/**
 * EMV chip in shiny gold, after the classic contact pattern. A highlight band
 * sweeps across it with ReflectiveCard's own tilt (--rc-rotate-x/-y, which it
 * sets on the card), so the gold catches the light as the card moves.
 */
function GoldChip() {
  return (
    <div
      className="relative h-[34px] w-[46px] overflow-hidden rounded-[8px] shadow-[inset_0_0_0_1px_rgba(90,60,10,0.55),0_1px_2px_rgba(0,0,0,0.5)]"
      style={{
        backgroundImage:
          "linear-gradient(135deg, #f7dd8b 0%, #d9aa45 35%, #f3d27a 55%, #b8862c 80%, #e7c06a 100%)",
      }}
      aria-hidden
    >
      {/* Sweeping highlight: swings around a point below the chip as the card tilts. */}
      <div
        className="absolute -inset-x-[150%] -top-[60%] h-[220%] mix-blend-screen"
        style={{
          transformOrigin: "50% 260%",
          transform:
            "rotate(calc(var(--rc-rotate-y, 0deg) * -3 + var(--rc-rotate-x, 0deg) * 1.5 - 8deg))",
          backgroundImage:
            "linear-gradient(100deg, transparent 42%, rgba(255,248,215,0.15) 46%, rgba(255,252,235,0.9) 50%, rgba(255,248,215,0.15) 54%, transparent 58%)",
        }}
      />
      <svg
        viewBox="0 0 100 76"
        className="absolute inset-0 size-full"
        fill="none"
        stroke="rgba(92,62,12,0.65)"
        strokeWidth="2.4"
        strokeLinejoin="round"
      >
        {/* top V into the centre stem */}
        <path d="M32 0 L48 16 Q50 18 50 21 L50 25 Q50 28 47 28 L0 28" />
        <path d="M68 0 L52 16" />
        <path d="M100 28 L56 28 Q53 28 53 31 L53 52" />
        <path d="M37 28 L37 52" />
        {/* middle band */}
        <path d="M0 52 L100 52" />
        {/* bottom V */}
        <path d="M50 52 L50 58 M50 58 L32 76 M50 58 L68 76" />
      </svg>
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
