import { useEffect, useState } from 'react'
import { getMedia } from '@/data/repositories/media'

/** Object URL for a stored media blob; revoked when the id changes or the component unmounts. */
export function useMediaUrl(id: string | undefined): string | undefined {
  const [loaded, setLoaded] = useState<{ id: string; url: string }>()

  useEffect(() => {
    if (!id) return
    let active = true
    let url: string | undefined
    void getMedia(id).then((media) => {
      if (!active || !media) return
      url = URL.createObjectURL(media.blob)
      setLoaded({ id, url })
    })
    return () => {
      active = false
      if (url) URL.revokeObjectURL(url)
    }
  }, [id])

  // Media rows are immutable (a new image gets a new id), so a stale id never shows.
  return loaded && loaded.id === id ? loaded.url : undefined
}
