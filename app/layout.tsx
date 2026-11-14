import type { Metadata, Viewport } from "next"
import { Geist_Mono, Oxanium } from "next/font/google"

import "./globals.css"
import { cn } from "@/lib/utils"
import { ThemeProvider } from "@/components/theme-provider"
import { AuthProvider } from "@/components/auth/auth-provider"
import { AuthGate } from "@/components/auth/auth-gate"
import { DateModeBoundary } from "@/components/date-mode-boundary"
import { Toaster } from "@/components/ui/sonner"
import { TextSelectMode } from "@/components/text-select-mode"

const oxanium = Oxanium({ subsets: ["latin"], variable: "--font-sans" })

const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
})

export const metadata: Metadata = {
  title: "Budget",
  description: "Personal monthly bills and income tracker",
  // Installed on the home screen: full screen, content under the status bar
  // (the header pads itself with the safe-area inset).
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
    { media: "(prefers-color-scheme: light)", color: "#ebebee" },
    { media: "(prefers-color-scheme: dark)", color: "#09090b" },
  ],
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn(
        "antialiased",
        fontMono.variable,
        "font-sans",
        oxanium.variable,
      )}
    >
      <body>
        <ThemeProvider>
          <AuthProvider>
            <AuthGate>
              <DateModeBoundary>{children}</DateModeBoundary>
            </AuthGate>
          </AuthProvider>
          <Toaster richColors position="top-center" />
          <TextSelectMode />
        </ThemeProvider>
      </body>
    </html>
  )
}
