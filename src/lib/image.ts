import type { NewMedia } from '@/data/repositories/media'

export const MAX_IMAGE_SIZE = 800

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality))
}

/**
 * Encode a canvas as WebP (JPEG where WebP encoding is unsupported). The JPEG fallback gets a
 * white background because JPEG has no transparency.
 */
export async function encodeCanvas(canvas: HTMLCanvasElement): Promise<NewMedia> {
  let blob = await canvasToBlob(canvas, 'image/webp', 0.85)
  if (!blob || blob.type !== 'image/webp') {
    const flat = document.createElement('canvas')
    flat.width = canvas.width
    flat.height = canvas.height
    const ctx = flat.getContext('2d')!
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, flat.width, flat.height)
    ctx.drawImage(canvas, 0, 0)
    blob = await canvasToBlob(flat, 'image/jpeg', 0.85)
  }
  if (!blob) throw new Error('Could not encode image')
  return { blob, mime: blob.type, width: canvas.width, height: canvas.height }
}

/** Downscale an image file (photo, screenshot, paste) to at most MAX_IMAGE_SIZE px. */
export async function prepareImage(file: Blob, maxSize = MAX_IMAGE_SIZE): Promise<NewMedia> {
  const bitmap = await createImageBitmap(file)
  try {
    const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    const ctx = canvas.getContext('2d')!
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    return await encodeCanvas(canvas)
  } finally {
    bitmap.close()
  }
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}
