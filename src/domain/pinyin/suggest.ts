import { pinyin, polyphonic } from 'pinyin-pro'
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

const ONLY_HAN = /^\p{Script=Han}{1,8}$/u

/**
 * True when `given` reads each character with one of its dictionary readings (還 hái or huán,
 * 了 le or liǎo), so a polyphonic character read right for its sentence isn't flagged.
 */
function isAnyReading(hanzi: string, given: string, ignoreTones = false): boolean {
  if (!ONLY_HAN.test(hanzi)) return false
  const options = polyphonic(hanzi, { type: 'array', toneType: 'symbol' }).map((rs) => rs.map(compact))
  const target = compact(given)
  const same = (a: string, b: string) => (ignoreTones ? toSearchKey(a) === toSearchKey(b) : tonesCompatible(a, b))
  const fits = (i: number, at: number): boolean =>
    i === options.length
      ? at === target.length
      : options[i]!.some((r) => {
          const piece = target.slice(at, at + r.length)
          return piece.length === r.length && same(piece, r) && fits(i + 1, at + r.length)
        })
  return fits(0, 0)
}

/**
 * Compare given pinyin with the dictionary reading. Only a hint: tone sandhi (一, 不) and
 * dictionary gaps legitimately differ. Any dictionary reading of a polyphonic character counts.
 */
export function checkPinyin(hanzi: string, given: string): PinyinCheck {
  const expected = suggestPinyin(hanzi)
  if (!expected || !given.trim()) return 'unknown'
  const a = compact(expected)
  const b = compact(given)
  if (a === b || tonesCompatible(a, b) || isAnyReading(hanzi.trim(), given)) return 'match'
  if (toSearchKey(a) === toSearchKey(b) || isAnyReading(hanzi.trim(), given, true)) return 'tone-differs'
  return 'mismatch'
}
