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

/** Letters only: drops spaces, apostrophes and punctuation so sentences compare too. */
const compact = (s: string) => normalizePinyin(s).toLowerCase().replace(/[^\p{L}\p{M}]/gu, '')

const TONE_MARK = /[̀́̄̌]/

/** Split into base letters (ü kept as u + diaeresis) and the tone mark on each letter, if any. */
function letterTones(s: string): { base: string; tones: string[] } {
  let base = ''
  const tones: string[] = []
  for (const ch of s.normalize('NFD')) {
    if (TONE_MARK.test(ch)) tones[base.length - 1] = ch
    else base += ch
  }
  return { base, tones }
}

/**
 * True when the readings differ only where one side is unmarked: the neutral tone
 * (鴨子 yāzi vs the dictionary's yāzǐ) is not a conflict.
 */
function tonesCompatible(a: string, b: string): boolean {
  const x = letterTones(a)
  const y = letterTones(b)
  if (x.base !== y.base) return false
  for (let i = 0; i < x.base.length; i++) {
    const ta = x.tones[i]
    const tb = y.tones[i]
    if (ta && tb && ta !== tb) return false
  }
  return true
}

/**
 * Compare given pinyin with the dictionary reading. Only a hint: polyphonic characters and
 * tone sandhi (一, 不) legitimately differ from the dictionary.
 */
export function checkPinyin(hanzi: string, given: string): PinyinCheck {
  const expected = suggestPinyin(hanzi)
  if (!expected || !given.trim()) return 'unknown'
  const a = compact(expected)
  const b = compact(given)
  if (a === b || tonesCompatible(a, b)) return 'match'
  if (toSearchKey(a) === toSearchKey(b)) return 'tone-differs'
  return 'mismatch'
}
