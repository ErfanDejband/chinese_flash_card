/** Canvas helpers shared by the PDF and image sources. */

export type Rotation = 0 | 90 | 180 | 270

export function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode the page image'))), type, quality),
  )
}

/** Copy of `source` scaled down so its long side is at most `longSide` (never scaled up). */
export function downscale(source: HTMLCanvasElement, longSide: number): HTMLCanvasElement {
  const scale = Math.min(1, longSide / Math.max(source.width, source.height))
  if (scale === 1) return source
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(source.width * scale)
  canvas.height = Math.round(source.height * scale)
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height)
  return canvas
}

export interface Region {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Draw `region` of an image onto a new canvas, rotated clockwise by `rotation` and scaled so the
 * long side is at most `longSide`, on white (transparent PNGs would otherwise turn black in JPEG).
 */
export function drawRegion(source: CanvasImageSource, region: Region, rotation: Rotation, longSide: number): HTMLCanvasElement {
  const scale = Math.min(1, longSide / Math.max(region.width, region.height))
  const w = Math.max(1, Math.round(region.width * scale))
  const h = Math.max(1, Math.round(region.height * scale))
  const sideways = rotation === 90 || rotation === 270
  const canvas = document.createElement('canvas')
  canvas.width = sideways ? h : w
  canvas.height = sideways ? w : h
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.imageSmoothingQuality = 'high'
  ctx.translate(canvas.width / 2, canvas.height / 2)
  ctx.rotate((rotation * Math.PI) / 180)
  ctx.drawImage(source, region.x, region.y, region.width, region.height, -w / 2, -h / 2, w, h)
  return canvas
}

export const nextRotation = (r: Rotation): Rotation => ((r + 90) % 360) as Rotation
