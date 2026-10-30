import type { NormBox } from '@/import/types'
import { frameBox } from './frame'

/** Side of a Snap card picture, in pixels (like other card pictures, MAX_IMAGE_SIZE). */
export const CARD_PICTURE_SIZE = 800

/**
 * Draws a Snap card picture into `canvas` (square, `size` px): the object with some of its
 * surroundings, which stay as a memory cue but are softly blurred and dimmed so the object stands
 * out, and a thin white ring round the object. Browser only (canvas). `source` may be the full
 * photo or its working copy: the box is relative (0–1000).
 */
export function drawCardPicture(canvas: HTMLCanvasElement, source: CanvasImageSource, sourceWidth: number, sourceHeight: number, box: NormBox, size = CARD_PICTURE_SIZE): void {
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  const { window: w, object } = frameBox(box, sourceWidth, sourceHeight)
  const scale = size / w.width

  // The surroundings: blurred (where the browser can) and dimmed. Drawn a little larger than the
  // canvas so the blur doesn't fade the edges.
  const blur = Math.round(size / 110)
  const bleed = blur * 2
  ctx.filter = `blur(${blur}px)`
  ctx.drawImage(source, w.x, w.y, w.width, w.height, -bleed, -bleed, size + bleed * 2, size + bleed * 2)
  ctx.filter = 'none'
  ctx.fillStyle = 'rgba(0, 0, 0, 0.42)'
  ctx.fillRect(0, 0, size, size)

  // The object, sharp, in a rounded window with a little room around it.
  const pad = size * 0.03
  const x = Math.max(0, object.x * scale - pad)
  const y = Math.max(0, object.y * scale - pad)
  const width = Math.min(size - x, object.width * scale + pad * 2)
  const height = Math.min(size - y, object.height * scale + pad * 2)
  const radius = Math.min(size * 0.035, width / 2, height / 2)
  ctx.save()
  ctx.beginPath()
  ctx.roundRect(x, y, width, height, radius)
  ctx.clip()
  ctx.drawImage(source, w.x, w.y, w.width, w.height, 0, 0, size, size)
  ctx.restore()

  // A thin white ring with a soft shadow.
  ctx.save()
  ctx.beginPath()
  ctx.roundRect(x, y, width, height, radius)
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)'
  ctx.lineWidth = Math.max(1.5, size / 200)
  ctx.shadowColor = 'rgba(0, 0, 0, 0.45)'
  ctx.shadowBlur = size / 60
  ctx.stroke()
  ctx.restore()
}
