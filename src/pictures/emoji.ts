import type { NewMedia } from '@/data/repositories/media'
import { encodeCanvas } from '@/lib/image'

const SIZE = 512
const FONT = '"Noto Color Emoji", "Apple Color Emoji", "Segoe UI Emoji", "Twemoji Mozilla", sans-serif'

/** Draw one emoji, large and centred on white, as a card picture (uses this device's emoji font). */
export async function renderEmoji(emoji: string): Promise<NewMedia> {
  const canvas = document.createElement('canvas')
  canvas.width = SIZE
  canvas.height = SIZE
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, SIZE, SIZE)
  ctx.font = `${Math.round(SIZE * 0.7)}px ${FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  // Emoji glyphs sit a little high on the middle baseline in most fonts.
  ctx.fillText(emoji, SIZE / 2, SIZE * 0.54)
  return encodeCanvas(canvas)
}
