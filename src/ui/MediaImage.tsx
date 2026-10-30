import { useMediaUrl } from '@/hooks/useMediaUrl'
import { cn } from './cn'
import { Icon } from './icons'

/**
 * A stored picture; `className` sizes and shapes it. The picture sits on white (transparent PNGs);
 * while it loads, a pulse; when it isn't on this device (yet), a quiet picture icon instead of an
 * empty box.
 */
export function MediaImage({ id, alt, className }: { id: string; alt: string; className?: string }) {
  const { url, missing } = useMediaUrl(id)
  if (missing) {
    return (
      <div className={cn('grid place-items-center bg-sunken text-muted', className)} role="img" aria-label="Picture not on this device yet" title="Picture not on this device yet">
        <Icon name="image" className="size-1/3 max-h-10 max-w-10 opacity-60" />
      </div>
    )
  }
  if (!url) return <div className={cn('animate-pulse bg-sunken', className)} aria-hidden="true" />
  return <img src={url} alt={alt} className={cn('bg-white object-contain', className)} draggable={false} />
}
