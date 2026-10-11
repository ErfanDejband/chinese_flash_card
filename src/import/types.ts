import type { Example } from '@/domain/types'

/** Types shared by the PDF → AI → draft-card pipeline. */

/** Box on a page image: [ymin, xmin, ymax, xmax], each normalised to 0–1000 (Gemini's native format). */
export type NormBox = [number, number, number, number]

/**
 * `vocabulary`: course pages (word lists, vocabulary slides, pictures with labels).
 * `reading`: story pages whose sentences are split into words (e.g. kids' books with zhuyin).
 */
export type ImportMode = 'vocabulary' | 'reading'

export type ItemKind = 'word' | 'sentence'
export type FieldSource = 'printed' | 'inferred'

/** `function`: grammatical particles (的, 了, 嗎); `number`: numbers, dates and counts. */
export type WordRole = 'word' | 'name' | 'function' | 'number'

/** One word of a sentence on a reading page, as returned by the model, after validation. */
export interface ReadingWord {
  hanzi: string
  pinyin: string
  meaning: string
  role: WordRole
  confidence: number
}

/** One sentence of a reading page, as returned by the model, after validation. */
export interface ReadingItem {
  text: string
  pinyin: string
  meaning: string
  words: ReadingWord[]
}

/** A piece of a sentence in the reader: a word chip, or the text between words (punctuation). */
export interface SentencePart {
  text: string
  word: boolean
}

/** A sentence as the import reader shows it. Stored with its page. */
export interface ReadingSentence {
  text: string
  pinyin: string
  meaning: string
  parts: SentencePart[]
  /** The model's words don't add up to the printed sentence: worth a look. */
  mismatch?: boolean
}

/** One study item as returned by the model, after validation. */
export interface ExtractedItem {
  kind: ItemKind
  hanzi: string
  pinyin: string
  meaning: string
  partOfSpeech: string
  notes: string
  hanziSource: FieldSource
  pinyinSource: FieldSource
  meaningSource: FieldSource
  imageBox: NormBox | null
  confidence: number
}

/**
 * Review hints. Info flags explain where a value came from; warning flags ask for attention.
 * Duplicates and non-Chinese items start unselected.
 */
export type DraftFlag =
  | 'hanzi-inferred'
  | 'pinyin-inferred'
  | 'meaning-inferred'
  | 'pinyin-mismatch'
  | 'tone-differs'
  | 'no-han'
  | 'maybe-simplified'
  | 'duplicate-existing'
  | 'duplicate-import'
  | 'low-confidence'
  /** In the learner's known-words list. */
  | 'known'
  /** Reading pages: a name, a particle or a number. */
  | 'name'
  | 'function-word'
  | 'number'

/** Flags that make a draft start unselected. */
export const UNSELECTED_FLAGS: ReadonlySet<DraftFlag> = new Set([
  'no-han',
  'duplicate-existing',
  'duplicate-import',
  'known',
  'name',
  'function-word',
  'number',
])

export const WARNING_FLAGS: ReadonlySet<DraftFlag> = new Set([
  'pinyin-mismatch',
  'no-han',
  'maybe-simplified',
  'duplicate-existing',
  'duplicate-import',
  'low-confidence',
])

/** Draft card fields produced by post-processing (before the crop image is attached). */
export interface DraftFields {
  kind: ItemKind
  hanzi: string
  pinyin: string
  meaning: string
  notes: string
  imageBox: NormBox | null
  hanziSource: FieldSource
  pinyinSource: FieldSource
  meaningSource: FieldSource
  confidence: number
  flags: DraftFlag[]
  selected: boolean
  /** Reading pages: the sentence the word came from. */
  example?: Example
}
