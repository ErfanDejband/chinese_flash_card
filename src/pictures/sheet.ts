import type { NormBox } from '@/import/types'
import type { PictureStyle } from './styles'
import type { SheetAspect } from './types'

/** Pictures per sheet the user can choose: more per sheet is cheaper, fewer gives bigger pictures. */
export type SheetSize = 4 | 6 | 9
export const SHEET_SIZES: readonly SheetSize[] = [4, 6, 9]
export const DEFAULT_SHEET_SIZE: SheetSize = 6

export interface SheetLayout {
  cols: number
  rows: number
  aspect: SheetAspect
}

/** The smallest grid that holds `count` pictures (count ≤ 9). */
export function layoutFor(count: number): SheetLayout {
  if (count <= 1) return { cols: 1, rows: 1, aspect: '1:1' }
  if (count <= 2) return { cols: 2, rows: 1, aspect: '3:2' }
  if (count <= 4) return { cols: 2, rows: 2, aspect: '1:1' }
  if (count <= 6) return { cols: 3, rows: 2, aspect: '3:2' }
  return { cols: 3, rows: 3, aspect: '1:1' }
}

export const cellCount = (l: SheetLayout) => l.cols * l.rows

/** Split items into sheets of at most `size`. */
export function groupIntoSheets<T>(items: T[], size: SheetSize): T[][] {
  const groups: T[][] = []
  for (let i = 0; i < items.length; i += size) groups.push(items.slice(i, i + size))
  return groups
}

/** A cell of the grid (left to right, top to bottom), inset so gutters and neighbours stay out. */
export function gridBox(layout: SheetLayout, index: number, inset = 0.03): NormBox {
  const col = index % layout.cols
  const row = Math.floor(index / layout.cols)
  const w = 1000 / layout.cols
  const h = 1000 / layout.rows
  const dx = w * inset
  const dy = h * inset
  return [Math.round(row * h + dy), Math.round(col * w + dx), Math.round((row + 1) * h - dy), Math.round((col + 1) * w - dx)]
}

const NO_TEXT = 'Absolutely no text, letters, numbers, labels or captions anywhere in the image.'

/** One image holding a picture per word, in grid order. */
export function sheetPrompt(style: PictureStyle, scenes: string[]): string {
  const layout = layoutFor(scenes.length)
  const cells = cellCount(layout)
  const lines = Array.from({ length: cells }, (_, i) => `${i + 1}. ${scenes[i] ?? 'leave this cell empty (plain white)'}`)
  const grid = cells === 1 ? 'A single picture' : `A sheet of ${cells} separate pictures in a grid of ${layout.rows} rows and ${layout.cols} columns`
  return [
    `${grid} for a vocabulary flashcard set${cells === 1 ? '' : ', with wide plain white gutters between the pictures'}. Each picture is centred in its own cell and shows exactly one thing, filling most of the cell.`,
    `Style for every picture: ${style.prompt}.`,
    NO_TEXT,
    cells === 1 ? `Picture: ${lines[0]!.slice(3)}` : `Cells, left to right, top to bottom:\n${lines.join('\n')}`,
  ].join('\n')
}

/** Four takes on the same word, to choose from. */
export function variantsPrompt(style: PictureStyle, scene: string): string {
  return sheetPrompt(style, [1, 2, 3, 4].map((n) => `${scene} (version ${n}: a different composition)`))
}
