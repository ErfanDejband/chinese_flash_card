import type { BBox } from '@/domain/types'
import type { NormBox } from '../types'

export interface PixelRect {
  x: number
  y: number
  width: number
  height: number
}

/** Boxes smaller than this share of the page side are treated as detection noise. */
const MIN_SIDE = 0.02

/**
 * Normalised [ymin, xmin, ymax, xmax] (0–1000) → pixel rectangle on an image of the given size,
 * padded by `pad` of the box size on each side and clamped to the image. Null for tiny boxes.
 */
export function boxToPixels(box: NormBox, width: number, height: number, pad = 0.03): PixelRect | null {
  const [ymin, xmin, ymax, xmax] = box.map((v) => v / 1000) as NormBox
  if (ymax - ymin < MIN_SIDE || xmax - xmin < MIN_SIDE) return null
  const padY = (ymax - ymin) * pad
  const padX = (xmax - xmin) * pad
  const x0 = Math.max(0, Math.floor((xmin - padX) * width))
  const y0 = Math.max(0, Math.floor((ymin - padY) * height))
  const x1 = Math.min(width, Math.ceil((xmax + padX) * width))
  const y1 = Math.min(height, Math.ceil((ymax + padY) * height))
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 }
}

/** Normalised box → rectangle in PDF page units (points, origin top-left), for the card's provenance. */
export function boxToPageUnits(box: NormBox, pointWidth: number, pointHeight: number): BBox {
  const [ymin, xmin, ymax, xmax] = box
  const r = (n: number) => Math.round(n * 10) / 10
  return {
    x: r((xmin / 1000) * pointWidth),
    y: r((ymin / 1000) * pointHeight),
    width: r(((xmax - xmin) / 1000) * pointWidth),
    height: r(((ymax - ymin) / 1000) * pointHeight),
  }
}

/** Pixel rectangle drawn by the user → normalised box. */
export function pixelsToBox(rect: PixelRect, width: number, height: number): NormBox {
  const n = (v: number, size: number) => Math.round(Math.min(1000, Math.max(0, (v / size) * 1000)))
  return [n(rect.y, height), n(rect.x, width), n(rect.y + rect.height, height), n(rect.x + rect.width, width)]
}
