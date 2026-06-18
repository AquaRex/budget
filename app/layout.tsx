import type { Metadata } from "next"
import { Geist_Mono, Oxanium } from "next/font/google"

import "./globals.css"
import { cn } from "@/lib/utils"
import { ThemeProvider } from "@/components/theme-provider"
import { AuthProvider } from "@/components/auth/auth-provider"
import { AuthGate } from "@/components/auth/auth-gate"
import { AppShell } from "@/components/app-shell"
import { Toaster } from "@/components/ui/sonner"

const oxanium = Oxanium({ subsets: ["latin"], variable: "--font-sans" })

const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
})

export const metadata: Metadata = {
  title: "Budget",
  description: "Personal monthly bills and income tracker",
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
              <AppShell>{children}</AppShell>
            </AuthGate>
          </AuthProvider>
          <Toaster richColors position="top-center" />
        </ThemeProvider>
      </body>
    </html>
  )
}
