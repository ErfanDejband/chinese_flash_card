import { useEffect, useState } from 'react'
import { getMedia } from '@/data/repositories/media'

export interface MediaUrl {
  /** Object URL of the stored picture, once loaded. */
  url?: string
  /** The picture isn't on this device (a card synced from another device before its picture arrived). */
  missing: boolean
}

/** A stored picture as an object URL; revoked when the id changes or the component unmounts. */
export function useMediaUrl(id: string | undefined): MediaUrl {
  const [loaded, setLoaded] = useState<{ id: string; url?: string }>()

  useEffect(() => {
    if (!id) return
    let active = true
    let url: string | undefined
    void getMedia(id).then((media) => {
      if (!active) return
      url = media ? URL.createObjectURL(media.blob) : undefined
      setLoaded({ id, url })
    })
    return () => {
      active = false
      if (url) URL.revokeObjectURL(url)
    }
  }, [id])

  // Media rows are immutable (a new image gets a new id), so a stale id never shows.
  if (!id || !loaded || loaded.id !== id) return { missing: false }
  return { url: loaded.url, missing: !loaded.url }
}
