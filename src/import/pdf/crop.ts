import type { NewMedia } from '@/data/repositories/media'
import { encodeCanvas, MAX_IMAGE_SIZE } from '@/lib/image'
import type { NormBox } from '../types'
import { boxToPixels } from './boxes'

/** Cut the picture inside `box` out of a page image, downscaled like any card image. Null for tiny boxes. */
export async function cropFromImage(image: Blob, box: NormBox, maxSize = MAX_IMAGE_SIZE): Promise<NewMedia | null> {
  const bitmap = await createImageBitmap(image)
  try {
    const rect = boxToPixels(box, bitmap.width, bitmap.height)
    if (!rect) return null
    const scale = Math.min(1, maxSize / Math.max(rect.width, rect.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(rect.width * scale))
    canvas.height = Math.max(1, Math.round(rect.height * scale))
    const ctx = canvas.getContext('2d')!
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(bitmap, rect.x, rect.y, rect.width, rect.height, 0, 0, canvas.width, canvas.height)
    return await encodeCanvas(canvas)
  } finally {
    bitmap.close()
  }
}
