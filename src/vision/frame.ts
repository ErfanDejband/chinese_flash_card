import type { NormBox } from '@/import/types'

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface FrameOptions {
  /** The window's side as a multiple of the object's longest side. */
  context?: number
  /** The smallest window, as a share of the photo's short side (tiny objects aren't blown up). */
  min?: number
}

/**
 * The square part of a photo (in its pixels) that becomes a card picture: the object with some
 * of its surroundings, centred on it, moved inside the photo where it would stick out (the object
 * then sits off-centre). Also the object's rectangle inside that window.
 */
export function frameBox(box: NormBox, photoWidth: number, photoHeight: number, { context = 2.4, min = 0.35 }: FrameOptions = {}): { window: Rect; object: Rect } {
  const obj = {
    x: (box[1] / 1000) * photoWidth,
    y: (box[0] / 1000) * photoHeight,
    width: ((box[3] - box[1]) / 1000) * photoWidth,
    height: ((box[2] - box[0]) / 1000) * photoHeight,
  }
  const short = Math.min(photoWidth, photoHeight)
  const side = Math.min(short, Math.max(short * min, Math.max(obj.width, obj.height) * context))
  const clamp = (v: number, max: number) => Math.min(Math.max(0, v), max)
  const x = clamp(obj.x + obj.width / 2 - side / 2, photoWidth - side)
  const y = clamp(obj.y + obj.height / 2 - side / 2, photoHeight - side)
  // The object as seen in the window (a very large object can reach past it).
  const ox = Math.max(obj.x, x)
  const oy = Math.max(obj.y, y)
  const object = { x: ox - x, y: oy - y, width: Math.min(obj.x + obj.width, x + side) - ox, height: Math.min(obj.y + obj.height, y + side) - oy }
  return { window: { x, y, width: side, height: side }, object }
}
