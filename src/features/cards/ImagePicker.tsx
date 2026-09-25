import { useEffect, useEffectEvent, useRef, useState } from 'react'
import type { NewMedia } from '@/data/repositories/media'
import { blobToDataUrl, prepareImage } from '@/lib/image'
import { Button } from '@/ui/Button'
import { Icon } from '@/ui/icons'
import { MediaImage } from '@/ui/MediaImage'

/** keep: leave the stored image alone · set: new image · remove: delete the stored image. */
export type ImageChange = { kind: 'keep' } | { kind: 'set'; media: NewMedia; preview: string } | { kind: 'remove' }

interface Props {
  currentImageId?: string
  value: ImageChange
  onChange(change: ImageChange): void
}

export function ImagePicker({ currentImageId, value, onChange }: Props) {
  const input = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string>()
  const [working, setWorking] = useState(false)

  async function acceptFile(file: Blob | undefined) {
    if (!file || !file.type.startsWith('image/')) return
    setWorking(true)
    setError(undefined)
    try {
      const media = await prepareImage(file)
      onChange({ kind: 'set', media, preview: await blobToDataUrl(media.blob) })
    } catch {
      setError('Could not read that image.')
    } finally {
      setWorking(false)
    }
  }

  // Desktop convenience: paste a screenshot anywhere on the page.
  const onPaste = useEffectEvent((e: ClipboardEvent) => {
    const file = [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith('image/'))
    if (file) {
      e.preventDefault()
      void acceptFile(file)
    }
  })
  useEffect(() => {
    const handler = (e: ClipboardEvent) => onPaste(e)
    window.addEventListener('paste', handler)
    return () => window.removeEventListener('paste', handler)
  }, [])

  const showsStored = value.kind === 'keep' && currentImageId
  const hasImage = value.kind === 'set' || showsStored

  return (
    <div>
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => input.current?.click()}
          className="grid size-28 shrink-0 place-items-center overflow-hidden rounded-2xl border-2 border-dashed border-line bg-surface text-muted hover:border-accent"
          aria-label={hasImage ? 'Change image' : 'Add image'}
        >
          {value.kind === 'set' ? (
            <img src={value.preview} alt="" className="size-full bg-white object-contain" />
          ) : showsStored ? (
            <MediaImage id={currentImageId} alt="" className="size-full bg-white object-contain" />
          ) : (
            <Icon name="image" className="size-8" />
          )}
        </button>
        <div className="flex flex-col items-start gap-2">
          <Button variant="secondary" size="sm" onClick={() => input.current?.click()} disabled={working}>
            {working ? 'Processing…' : hasImage ? 'Change image' : 'Choose image'}
          </Button>
          {hasImage && (
            <Button variant="ghost" size="sm" onClick={() => onChange({ kind: 'remove' })}>
              Remove
            </Button>
          )}
          <span className="hidden text-xs text-muted md:block">or paste an image</span>
        </div>
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <input
        ref={input}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          void acceptFile(e.target.files?.[0])
          e.target.value = ''
        }}
      />
    </div>
  )
}
