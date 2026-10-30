"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

/** Old Spending tab: forwards (keeping the query) so installed shortcuts still work. */
export default function OsSpendingForward() {
  const router = useRouter()
  useEffect(() => {
    router.replace(`/os/transactions/${window.location.search}`)
  }, [router])
  return null
}
