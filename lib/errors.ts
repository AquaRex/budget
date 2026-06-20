/** Best-effort human message from an unknown throw (incl. Supabase errors). */
export function errMessage(e: unknown, fallback: string): string {
  if (e instanceof Error) return e.message
  if (
    e &&
    typeof e === "object" &&
    "message" in e &&
    typeof (e as { message: unknown }).message === "string"
  ) {
    return (e as { message: string }).message
  }
  return fallback
}
