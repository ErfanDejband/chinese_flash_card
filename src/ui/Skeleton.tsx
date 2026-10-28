import { cn } from './cn'

/** A light band sweeping across its (relative, overflow-hidden) parent; left out when the user asks for less motion. */
export function Shimmer({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'pointer-events-none absolute inset-0 bg-linear-to-r from-transparent via-white/60 to-transparent motion-safe:animate-shimmer motion-reduce:hidden dark:via-white/10',
        className,
      )}
    />
  )
}

/** A placeholder block for content that is on its way; size and shape come from `className`. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <span aria-hidden="true" className={cn('relative block overflow-hidden rounded-lg bg-sunken', className)}>
      <Shimmer />
    </span>
  )
}
