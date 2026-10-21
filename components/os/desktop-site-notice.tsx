"use client"

import { MonitorSmartphone } from "lucide-react"

import { useDesktopSiteScale } from "@/components/os/platform"

/**
 * Full-width guidance shown while the browser forces its desktop layout. Its
 * text is scaled up by the same factor the page is shrunk, so it stays readable.
 */
export function DesktopSiteNotice() {
  const scale = useDesktopSiteScale()
  if (scale === 1) {
    return null
  }
  return (
    <div
      role="alert"
      className="bg-primary w-full text-zinc-950"
      style={{ fontSize: `${scale}rem` }}
    >
      <div className="flex items-start gap-[0.75em] p-[1em] leading-snug">
        <MonitorSmartphone
          className="mt-[0.15em] size-[1.5em] shrink-0"
          aria-hidden
        />
        <div className="flex flex-col gap-[0.4em]">
          <p className="font-semibold">
            Desktop site is on, so the app is shown tiny.
          </p>
          <p>
            Chrome: tap <b>⋮</b> and untick <b>Desktop site</b>. Samsung
            Internet: tap <b>≡</b> and choose <b>Mobile version</b>.
          </p>
          <p>Installing the app from the browser menu also avoids this.</p>
        </div>
      </div>
    </div>
  )
}
