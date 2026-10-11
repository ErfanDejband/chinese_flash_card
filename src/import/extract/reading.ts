import { containsHan } from '@/domain/cjk'
import { normalizePinyin } from '@/domain/pinyin/tones'
import type { DraftFields, DraftFlag, ReadingItem, ReadingSentence, SentencePart, WordRole } from '../types'
import { contentFlags, startsSelected, type PostprocessContext } from './postprocess'

const ROLE_FLAG: Partial<Record<WordRole, DraftFlag>> = { name: 'name', function: 'function-word', number: 'number' }

/**
 * Split a printed sentence into the model's words and the text between them (punctuation).
 * `mismatch` when the words skip or invent characters, so the reader can say the split needs a look.
 */
export function alignSentence(text: string, words: string[]): { parts: SentencePart[]; mismatch: boolean } {
  const parts: SentencePart[] = []
  let pos = 0
  let mismatch = false
  const gap = (s: string) => {
    if (!s) return
    parts.push({ text: s, word: false })
    if (containsHan(s)) mismatch = true
  }
  for (const w of words) {
    const at = text.indexOf(w, pos)
    if (at === -1) {
      mismatch = true
      continue
    }
    gap(text.slice(pos, at))
    parts.push({ text: w, word: true })
    pos = at + w.length
  }
  gap(text.slice(pos))
  return { parts, mismatch }
}

export interface ReadingResult {
  drafts: DraftFields[]
  sentences: ReadingSentence[]
}

/**
 * Turn a reading page into draft cards: one per word not yet in the deck or in this import
 * (later occurrences link to the first one through their characters). Each draft keeps its
 * sentence as the example. Names, particles, numbers and known words start unselected. Pure,
 * except that `ctx.seenInImport` is updated.
 */
export function readingDrafts(items: ReadingItem[], ctx: PostprocessContext): ReadingResult {
  const drafts: DraftFields[] = []
  const sentences: ReadingSentence[] = []
  for (const s of items) {
    const { parts, mismatch } = alignSentence(s.text, s.words.map((w) => w.hanzi))
    sentences.push({ text: s.text, pinyin: normalizePinyin(s.pinyin), meaning: s.meaning, parts, ...(mismatch ? { mismatch } : {}) })

    for (const w of s.words) {
      const hanzi = w.hanzi
      if (!containsHan(hanzi) || ctx.existingHanzi.has(hanzi) || ctx.seenInImport.has(hanzi)) continue
      ctx.seenInImport.add(hanzi)
      const pinyin = normalizePinyin(w.pinyin)
      const flags = contentFlags(hanzi, pinyin, w.confidence, ctx)
      const roleFlag = ROLE_FLAG[w.role]
      if (roleFlag) flags.push(roleFlag)
      if (ctx.knownHanzi?.has(hanzi)) flags.push('known')
      drafts.push({
        kind: 'word',
        hanzi,
        pinyin,
        meaning: w.meaning,
        notes: '',
        imageBox: null,
        // Readings come from zhuyin or the model, meanings from the model; the pinyin check is the safety net.
        hanziSource: 'printed',
        pinyinSource: 'inferred',
        meaningSource: 'inferred',
        confidence: w.confidence,
        flags,
        selected: startsSelected(flags),
        example: { hanzi: s.text, pinyin: normalizePinyin(s.pinyin), meaning: s.meaning },
      })
    }
  }
  return { drafts, sentences }
}
