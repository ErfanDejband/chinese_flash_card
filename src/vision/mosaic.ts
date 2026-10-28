import type { NormBox } from '@/import/types'
import { padBox } from './detections'

/** Most objects one mosaic holds (4 × 4). */
export const MOSAIC_MAX = 16

export interface MosaicLayout {
  cols: number
  rows: number
  /** Side of one square cell, in pixels. */
  cell: number
  width: number
  height: number
}

/**
 * A near-square grid for `count` pictures. Most AI services charge an image by its pixel area
 * (Gemini by the image), so one grid of small cells costs far less than the whole photo.
 */
export function mosaicLayout(count: number, cell = 224): MosaicLayout {
  const n = Math.min(Math.max(1, count), MOSAIC_MAX)
  const cols = Math.ceil(Math.sqrt(n))
  const rows = Math.ceil(n / cols)
  return { cols, rows, cell, width: cols * cell, height: rows * cell }
}

/** Row and column (1-based) of picture `i` (0-based), filled row by row. */
export function cellPosition(layout: MosaicLayout, i: number): { row: number; col: number } {
  return { row: Math.floor(i / layout.cols) + 1, col: (i % layout.cols) + 1 }
}

/**
 * The chosen objects of `photo`, each cut with some room around it, fitted into its cell on a
 * light background and numbered 1… in the top-left corner (browser only).
 */
export function drawMosaic(photo: HTMLCanvasElement, boxes: readonly NormBox[], cell = 224): HTMLCanvasElement {
  const layout = mosaicLayout(boxes.length, cell)
  const canvas = document.createElement('canvas')
  canvas.width = layout.width
  canvas.height = layout.height
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#f3f1ed'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.imageSmoothingQuality = 'high'
  boxes.slice(0, MOSAIC_MAX).forEach((box, i) => {
    const [y0, x0, y1, x1] = padBox(box).map((v, k) => (v / 1000) * (k % 2 ? photo.width : photo.height))
    const w = x1! - x0!
    const h = y1! - y0!
    const inner = cell - 8
    const scale = Math.min(inner / w, inner / h)
    const { row, col } = cellPosition(layout, i)
    const left = (col - 1) * cell + (cell - w * scale) / 2
    const top = (row - 1) * cell + (cell - h * scale) / 2
    ctx.drawImage(photo, x0!, y0!, w, h, left, top, w * scale, h * scale)
    // The number the reply refers to: white on black, so it reads on any photo.
    const label = String(i + 1)
    ctx.font = 'bold 22px sans-serif'
    const bw = ctx.measureText(label).width + 14
    ctx.fillStyle = '#111'
    ctx.fillRect((col - 1) * cell + 4, (row - 1) * cell + 4, bw, 30)
    ctx.fillStyle = '#fff'
    ctx.textBaseline = 'middle'
    ctx.fillText(label, (col - 1) * cell + 11, (row - 1) * cell + 20)
    ctx.strokeStyle = '#d8d2c8'
    ctx.strokeRect((col - 1) * cell + 0.5, (row - 1) * cell + 0.5, cell - 1, cell - 1)
  })
  return canvas
}
