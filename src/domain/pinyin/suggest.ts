import { pinyin } from 'pinyin-pro'
import { normalizePinyin, toSearchKey } from './tones'

/** Pinyin for `hanzi` with tone marks, syllables of a word joined: `老師` → `lǎoshī`. */
export function suggestPinyin(hanzi: string): string {
  const text = hanzi.trim()
  if (!text) return ''
  const parts = pinyin(text, { toneType: 'symbol', type: 'array', nonZh: 'consecutive' })
  return normalizePinyin(parts.join(''))
}

export type PinyinCheck = 'match' | 'tone-differs' | 'mismatch' | 'unknown'

const compact = (s: string) => normalizePinyin(s).toLowerCase().replace(/[\s'’·-]/g, '')

/**
 * Compare given pinyin with the dictionary reading. Only a hint: polyphonic characters and
 * tone sandhi (一, 不) legitimately differ from the dictionary.
 */
export function checkPinyin(hanzi: string, given: string): PinyinCheck {
  const expected = suggestPinyin(hanzi)
  if (!expected || !given.trim()) return 'unknown'
  const a = compact(expected)
  const b = compact(given)
  if (a === b) return 'match'
  if (toSearchKey(a) === toSearchKey(b)) return 'tone-differs'
  return 'mismatch'
}
