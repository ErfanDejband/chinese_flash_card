import { activeSupportLinks } from '@/lib/support'
import { cn } from './cn'
import { Icon } from './icons'

/** Small heart for a page header that opens the first donation link; nothing while none is filled in (lib/support.ts). */
export function SupportButton({ className }: { className?: string }) {
  const link = activeSupportLinks()[0]
  if (!link) return null
  return (
    <a
      href={link.url}
      target="_blank"
      rel="noreferrer"
      className={cn('grid size-10 place-items-center rounded-full text-muted hover:bg-sunken hover:text-accent', className)}
      aria-label={link.label}
      title={link.label}
    >
      <Icon name="heart" />
    </a>
  )
}
