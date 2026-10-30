"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

/** Old bookmarks and drill links: /spending?… now lives at /transactions?…. */
export default function SpendingRedirect() {
  const router = useRouter()
  useEffect(() => {
    router.replace(`/transactions${window.location.search}`)
  }, [router])
  return null
}
