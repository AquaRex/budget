import { cn } from "@/lib/utils"

/** A labelled number with a hint line; bad turns the hint red. */
export function Figure({
  label,
  value,
  hint,
  bad,
}: {
  label: string
  value: string
  hint: string
  bad?: boolean
}) {
  return (
    <div className="flex flex-col gap-0.5 border px-3 py-2">
      <span className="text-muted-foreground text-[11px] font-semibold tracking-widest uppercase">
        {label}
      </span>
      <span className="text-lg font-semibold tabular-nums">{value}</span>
      <span
        className={cn(
          "text-xs",
          bad ? "text-rose-700 dark:text-rose-400" : "text-muted-foreground",
        )}
      >
        {hint}
      </span>
    </div>
  )
}
