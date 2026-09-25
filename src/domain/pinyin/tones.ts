/** Pinyin text utilities: tone-number conversion, normalisation, search keys. */

const TONES: Record<string, readonly [string, string, string, string]> = {
  a: ['ā', 'á', 'ǎ', 'à'],
  e: ['ē', 'é', 'ě', 'è'],
  i: ['ī', 'í', 'ǐ', 'ì'],
  o: ['ō', 'ó', 'ǒ', 'ò'],
  u: ['ū', 'ú', 'ǔ', 'ù'],
  ü: ['ǖ', 'ǘ', 'ǚ', 'ǜ'],
  A: ['Ā', 'Á', 'Ǎ', 'À'],
  E: ['Ē', 'É', 'Ě', 'È'],
  I: ['Ī', 'Í', 'Ǐ', 'Ì'],
  O: ['Ō', 'Ó', 'Ǒ', 'Ò'],
  U: ['Ū', 'Ú', 'Ǔ', 'Ù'],
  Ü: ['Ǖ', 'Ǘ', 'Ǚ', 'Ǜ'],
}

const TONE_MARKED_VOWEL = /[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜĀÁǍÀĒÉĚÈĪÍǏÌŌÓǑÒŪÚǓÙǕǗǙǛ]/

/** Some fonts and typists use a breve (ă) instead of a caron (ǎ) for the third tone. */
const BREVE_TO_CARON: Record<string, string> = {
  ă: 'ǎ', ĕ: 'ě', ĭ: 'ǐ', ŏ: 'ǒ', ŭ: 'ǔ',
  Ă: 'Ǎ', Ĕ: 'Ě', Ĭ: 'Ǐ', Ŏ: 'Ǒ', Ŭ: 'Ǔ',
}

/** Place a tone mark on one syllable, following the standard rules (a/e first, then o in "ou", else the last vowel). */
function markSyllable(syllable: string, tone: number): string {
  const s = syllable.replace(/u:/g, 'ü').replace(/U:/g, 'Ü').replace(/v/g, 'ü').replace(/V/g, 'Ü')
  if (tone < 1 || tone > 4) return s // 5 / 0 = neutral tone
  const lower = s.toLowerCase()
  let idx = lower.search(/[ae]/)
  if (idx === -1) idx = lower.indexOf('ou')
  if (idx === -1) {
    for (let i = lower.length - 1; i >= 0; i--) {
      if ('iouü'.includes(lower[i]!)) {
        idx = i
        break
      }
    }
  }
  const marks = idx === -1 ? undefined : TONES[s[idx]!]
  if (!marks) return s
  return s.slice(0, idx) + marks[tone - 1] + s.slice(idx + 1)
}

/** `lao3shi1` → `lǎoshī`, `nv3` → `nǚ`, `ma5` → `ma`. Text without tone numbers is returned unchanged. */
export function numberedToMarked(input: string): string {
  return input.replace(/([A-Za-züÜ:]+)([0-5])/g, (_, syl: string, tone: string) => markSyllable(syl, Number(tone)))
}

/**
 * Canonical stored form: precomposed (NFC) tone marks, Latin a/g instead of the
 * IPA ɑ/ɡ that textbook fonts often use, carons instead of breves, tone numbers converted.
 */
export function normalizePinyin(input: string): string {
  let s = input.replace(/ɑ/g, 'a').replace(/ɡ/g, 'g').normalize('NFC')
  s = s.replace(/[ăĕĭŏŭĂĔĬŎŬ]/g, (c) => BREVE_TO_CARON[c] ?? c)
  if (/[0-5]/.test(s)) s = numberedToMarked(s)
  return s.replace(/\s+/g, ' ').trim()
}

/** Tone-less, space-less, lowercase key for search and loose comparison (`lǎo shī` → `laoshi`). */
export function toSearchKey(input: string): string {
  return input
    .replace(/ɑ/g, 'a')
    .replace(/ɡ/g, 'g')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/v/g, 'u')
    .replace(/[\s\d'’·-]/g, '')
}

/** Heuristic: Latin text carrying tone marks or tone numbers. */
export function looksLikePinyin(text: string): boolean {
  const s = text.replace(/ɑ/g, 'a').replace(/ɡ/g, 'g').normalize('NFC').trim()
  if (!s || !/^[\p{Script=Latin}\s'’·\-0-5,.!?]+$/u.test(s)) return false
  return TONE_MARKED_VOWEL.test(s) || /[a-zü]+[1-5]/i.test(s)
}
