import { toSearchKey } from './pinyin/tones'
import type { Card } from './types'

/** Match characters, tone-insensitive pinyin (`laoshi`, `lao3`), meaning, notes or tags. */
export function matchesQuery(card: Card, query: string): boolean {
  const q = query.trim()
  if (!q) return true
  if (card.hanzi.includes(q)) return true
  const key = toSearchKey(q)
  if (key && toSearchKey(card.pinyin).includes(key)) return true
  const lower = q.toLowerCase()
  return [card.meaning, card.notes, ...card.tags].some((text) => text?.toLowerCase().includes(lower))
}
