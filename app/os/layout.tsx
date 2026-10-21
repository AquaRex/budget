import type { Metadata, Viewport } from "next"

import { OsShell } from "@/components/os/os-shell"

export const metadata: Metadata = {
  title: "Budget OS",
  description: "Quick-glance budget for your phone",
  appleWebApp: {
    capable: true,
    title: "Budget",
    statusBarStyle: "black-translucent",
  },
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#09090b" },
  ],
}

export default function OsLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return <OsShell>{children}</OsShell>
}
