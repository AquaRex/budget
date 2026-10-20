import { cn } from "@/lib/utils"
import { Card } from "@/components/ui/card"

/** Card with a small uppercase label row — the dashboard's section frame. */
export function Panel({
  title,
  subtitle,
  action,
  className,
  children,
}: {
  title: React.ReactNode
  subtitle?: React.ReactNode
  action?: React.ReactNode
  className?: string
  children: React.ReactNode
}) {
  return (
    <Card
      size="sm"
      className={cn(
        "gap-4 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 duration-500",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3 px-(--card-spacing)">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 className="text-muted-foreground text-[11px] font-semibold tracking-widest uppercase">
            {title}
          </h2>
          {subtitle && (
            <p className="text-muted-foreground text-xs">{subtitle}</p>
          )}
        </div>
        {action}
      </div>
      <div className="px-(--card-spacing)">{children}</div>
    </Card>
  )
}
