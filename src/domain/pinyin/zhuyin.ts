/**
 * Pinyin → zhuyin (bopomofo). Zhuyin is never stored: it is worked out from a card's pinyin when
 * shown, so every card has it and editing the pinyin updates it. This file is on the eager path:
 * it must not import pinyin-pro or `suggest.ts`, whose dictionary stays in a lazy chunk.
 */
import { normalizePinyin } from './tones'
import { SYLLABLES, VOWEL_START } from './zhuyinData'

const INITIALS: Record<string, string> = {
  b: 'ㄅ', p: 'ㄆ', m: 'ㄇ', f: 'ㄈ', d: 'ㄉ', t: 'ㄊ', n: 'ㄋ', l: 'ㄌ', g: 'ㄍ', k: 'ㄎ', h: 'ㄏ',
  j: 'ㄐ', q: 'ㄑ', x: 'ㄒ', zh: 'ㄓ', ch: 'ㄔ', sh: 'ㄕ', r: 'ㄖ', z: 'ㄗ', c: 'ㄘ', s: 'ㄙ',
}

const FINALS: Record<string, string> = {
  a: 'ㄚ', o: 'ㄛ', e: 'ㄜ', ê: 'ㄝ', ai: 'ㄞ', ei: 'ㄟ', ao: 'ㄠ', ou: 'ㄡ', an: 'ㄢ', en: 'ㄣ', ang: 'ㄤ', eng: 'ㄥ', er: 'ㄦ', ong: 'ㄨㄥ',
  i: 'ㄧ', ia: 'ㄧㄚ', ie: 'ㄧㄝ', iao: 'ㄧㄠ', iu: 'ㄧㄡ', ian: 'ㄧㄢ', in: 'ㄧㄣ', iang: 'ㄧㄤ', ing: 'ㄧㄥ', iong: 'ㄩㄥ',
  u: 'ㄨ', ua: 'ㄨㄚ', uo: 'ㄨㄛ', uai: 'ㄨㄞ', ui: 'ㄨㄟ', uan: 'ㄨㄢ', un: 'ㄨㄣ', uang: 'ㄨㄤ',
  ü: 'ㄩ', üe: 'ㄩㄝ', üan: 'ㄩㄢ', ün: 'ㄩㄣ',
}

/** Pinyin spells these with y or w, which zhuyin doesn't have. */
const Y_W: Record<string, string> = {
  yi: 'ㄧ', ya: 'ㄧㄚ', yo: 'ㄧㄛ', ye: 'ㄧㄝ', yao: 'ㄧㄠ', you: 'ㄧㄡ', yan: 'ㄧㄢ', yin: 'ㄧㄣ', yang: 'ㄧㄤ', ying: 'ㄧㄥ', yong: 'ㄩㄥ',
  wu: 'ㄨ', wa: 'ㄨㄚ', wo: 'ㄨㄛ', wai: 'ㄨㄞ', wei: 'ㄨㄟ', wan: 'ㄨㄢ', wen: 'ㄨㄣ', wang: 'ㄨㄤ', weng: 'ㄨㄥ',
  yu: 'ㄩ', yue: 'ㄩㄝ', yuan: 'ㄩㄢ', yun: 'ㄩㄣ',
}

function spell(syllable: string): string {
  const special = Y_W[syllable]
  if (special) return special
  const initial = /^(zh|ch|sh|[bpmfdtnlgkhjqxrzcs])/.exec(syllable)?.[0] ?? ''
  const rest = syllable.slice(initial.length)
  // The i of zhi, si… only carries the initial's own sound.
  if (rest === 'i' && /^(zh|ch|sh|r|z|c|s)$/.test(initial)) return INITIALS[initial]!
  // After j, q and x pinyin writes ü as u.
  const final = /^[jqx]$/.test(initial) ? rest.replace(/^u/, 'ü') : rest
  return (INITIALS[initial] ?? '') + FINALS[final]!
}

const ZHUYIN = new Map(SYLLABLES.map((s) => [s, spell(s)]))
const LONGEST_SYLLABLE = 6
const TONE_MARKS = ['', '', 'ˊ', 'ˇ', 'ˋ']
const TONE_OF: Record<string, number> = { '̄': 1, '́': 2, '̌': 3, '̀': 4 }
const WRONG_LENGTH = 100

/** The letters of a word without tone marks, and the tone found on each letter (0 = none). */
function readLetters(word: string): { text: string; tones: number[] } {
  let text = ''
  const tones: number[] = []
  for (const ch of word.normalize('NFD')) {
    const tone = TONE_OF[ch]
    if (tone) tones[text.length - 1] = tone
    else if (ch === '̈') text = text.slice(0, -1) + 'ü'
    else if (ch === '̂') text = text.slice(0, -1) + 'ê'
    else {
      text += ch === 'v' ? 'ü' : ch
      tones[text.length - 1] = 0
    }
  }
  return { text, tones }
}

interface Parse {
  /** Lower is better. */
  penalty: number
  syllables: string[]
  /** Index of the character after this word. */
  next: number
}

function writeSyllable(zhuyin: string, tone: number, toned: boolean, erhua: boolean): string {
  const body = zhuyin + (TONE_MARKS[tone] ?? '') + (erhua ? 'ㄦ' : '')
  return toned && !tone ? `˙${body}` : body
}

/**
 * The best split of a word into syllables, or null if there is none. A word can split two ways
 * (fāng+àn, fān+gàn), so inside a word a syllable must start with a vowel exactly when its
 * character can. With no character to ask, it follows the spelling rule that an apostrophe would
 * mark such a syllable.
 */
function parseWord(word: ReturnType<typeof readLetters>, chars: string[], start: number, isLast: boolean, toned: boolean): Parse | null {
  const { text, tones } = word
  const memo = new Map<string, Parse | null>()

  const from = (pos: number, at: number): Parse | null => {
    if (pos === text.length) {
      const allRead = !isLast || chars.length === 0 || at === chars.length
      return { penalty: allRead ? 0 : WRONG_LENGTH, syllables: [], next: at }
    }
    const key = `${pos}:${at}`
    const known = memo.get(key)
    if (known !== undefined) return known

    let best: Parse | null = null
    for (let end = Math.min(text.length, pos + LONGEST_SYLLABLE); end > pos; end--) {
      const syllable = text.slice(pos, end)
      const zhuyin = ZHUYIN.get(syllable)
      const marks = tones.slice(pos, end).filter(Boolean)
      if (!zhuyin || marks.length > 1) continue

      const erhua = text[end] === 'r' && !/[aeiouü]/.test(text[end + 1] ?? '')
      const char = chars[at]
      const vowelStart = /^[aeoê]/.test(syllable)
      const misfit = pos > 0 && (char ? VOWEL_START.has(char) !== vowelStart : vowelStart)
      const nextAt = erhua && /[兒儿]/.test(chars[at + 1] ?? '') ? at + 2 : at + 1
      const rest = from(erhua ? end + 1 : end, nextAt)
      if (!rest) continue

      const penalty = rest.penalty + (misfit ? 1 : 0)
      if (!best || penalty < best.penalty) {
        const written = writeSyllable(zhuyin, marks[0] ?? 0, toned, erhua)
        best = { penalty, syllables: [written, ...rest.syllables], next: rest.next }
      }
    }
    memo.set(key, best)
    return best
  }
  return from(0, start)
}

/**
 * Zhuyin for `pinyin`, one syllable after another: `lǎoshī` → `ㄌㄠˇ ㄕ`. `hanzi`, the same text in
 * characters, tells apart splits that the letters can't. Null when any part isn't pinyin, so callers
 * show the pinyin rather than half-converted text; also for a card that is itself a zhuyin symbol.
 */
export function toZhuyin(pinyin: string, hanzi = ''): string | null {
  if (/\p{Script=Bopomofo}/u.test(hanzi)) return null
  const pieces = normalizePinyin(pinyin)
    .toLowerCase()
    .replace(/[\s'’·-]+/g, ' ')
    .split(/([\p{L}\p{M}]+)/u)
  const words = pieces.flatMap((piece, i) => (i % 2 === 1 ? [readLetters(piece)] : []))
  if (words.length === 0) return null

  const toned = words.some((w) => w.tones.some(Boolean))
  const chars = [...hanzi].filter((c) => /\p{Script=Han}/u.test(c))
  const written: string[] = []
  let at = 0
  for (const [i, word] of words.entries()) {
    const parse = parseWord(word, chars, at, i === words.length - 1, toned)
    if (!parse) return null
    written.push(parse.syllables.join(' '))
    at = parse.next
  }
  return pieces
    .map((piece, i) => (i % 2 === 1 ? written[(i - 1) / 2] : piece))
    .join('')
    .trim()
}
