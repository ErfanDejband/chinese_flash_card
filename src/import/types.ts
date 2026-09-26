/** Types shared by the PDF → AI → draft-card pipeline. */

/** Box on a page image: [ymin, xmin, ymax, xmax], each normalised to 0–1000 (Gemini's native format). */
export type NormBox = [number, number, number, number]

export type ItemKind = 'word' | 'sentence'
export type FieldSource = 'printed' | 'inferred'

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
}
