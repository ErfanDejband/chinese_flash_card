import { useEffect, useRef } from 'react'
import type { NormBox } from '@/import/types'
import { drawCardPicture } from '@/vision/cardPicture'
import type { Photo } from './photo'

/** The card picture an object will get (spotlight on the object), drawn small from the working copy. */
export function CardPicturePreview({ photo, box, size }: { photo: Photo; box: NormBox; size: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    // Twice the shown size, so it stays sharp on phone screens.
    if (ref.current) drawCardPicture(ref.current, photo.canvas, photo.canvas.width, photo.canvas.height, box, size * 2)
  }, [photo, box, size])
  return <canvas ref={ref} className="shrink-0 rounded-lg bg-sunken" style={{ width: size, height: size }} aria-hidden="true" />
}
