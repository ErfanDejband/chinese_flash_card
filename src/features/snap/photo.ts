import { canvasToBlob, downscale } from '@/import/render'
import type { NormBox } from '@/import/types'

/** Long side of the photo Snap works on (the import sends the same size to the AI). */
export const PHOTO_SIZE = 1536
/** Boxes covering more of the photo than this are "big things" (desk, TV): chips, not boxes. */
export const BIG_AREA = 0.35

export interface Photo {
  /** The working copy (at most PHOTO_SIZE): detection, the mosaic, previews. */
  canvas: HTMLCanvasElement
  blob: Blob
  url: string
  key: string
  /** The photo as taken: card pictures are cut from it at full resolution. */
  file: File
}

export type ChosenSource = 'detector' | 'big' | 'tapped' | 'empty' | 'drawn'

/** How an object was chosen, in the chosen list. */
export const SOURCE_TEXT: Record<ChosenSource, string> = {
  detector: 'suggested',
  big: 'big thing',
  tapped: 'tapped',
  empty: 'tapped spot',
  drawn: 'drawn',
}

/** An object the learner picked in the photo. */
export interface Chosen {
  box: NormBox
  /** The detector's guess, sent to the AI as a hint (never shown as the word). */
  label?: string
  source: ChosenSource
  adjusted?: boolean
}

/** A photo file as Snap's working copy: rotated as shot (EXIF), at most PHOTO_SIZE, as JPEG. */
export async function readPhoto(file: File): Promise<Photo> {
  const bitmap = await createImageBitmap(file)
  const full = document.createElement('canvas')
  full.width = bitmap.width
  full.height = bitmap.height
  full.getContext('2d')!.drawImage(bitmap, 0, 0)
  bitmap.close()
  const canvas = downscale(full, PHOTO_SIZE)
  const blob = await canvasToBlob(canvas, 'image/jpeg', 0.9)
  return { canvas, blob, url: URL.createObjectURL(blob), key: `${file.name}-${file.lastModified}-${file.size}`, file }
}
