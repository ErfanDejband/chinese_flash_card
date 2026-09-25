import { useMediaUrl } from '@/hooks/useMediaUrl'
import { cn } from './cn'

export function MediaImage({ id, alt, className }: { id: string; alt: string; className?: string }) {
  const url = useMediaUrl(id)
  if (!url) return <div className={cn('animate-pulse bg-sunken', className)} aria-hidden="true" />
  return <img src={url} alt={alt} className={className} draggable={false} />
}
