import type { ExtractedItem, FieldSource, NormBox, ReadingItem, ReadingWord, WordRole } from '../types'

export class ModelOutputError extends Error {}

/** Parse a model reply that should be JSON but may be wrapped in code fences or prose. */
export function parseModelJson(text: string): unknown {
  const unfenced = text.replace(/```(?:json)?/gi, '').trim()
  const start = unfenced.indexOf('{')
  const end = unfenced.lastIndexOf('}')
  if (start === -1 || end <= start) throw new ModelOutputError('The model did not return JSON.')
  try {
    return JSON.parse(unfenced.slice(start, end + 1))
  } catch {
    throw new ModelOutputError('The model returned malformed JSON.')
  }
}

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
const source = (v: unknown): FieldSource => (v === 'printed' ? 'printed' : 'inferred')

/** Valid 0–1000 box with positive area; reversed corners are swapped. */
export function parseBox(v: unknown): NormBox | null {
  if (!Array.isArray(v) || v.length !== 4 || !v.every((n) => typeof n === 'number' && Number.isFinite(n))) return null
  const c = v.map((n: number) => Math.min(1000, Math.max(0, n)))
  const [y1, x1, y2, x2] = c as NormBox
  const box: NormBox = [Math.min(y1, y2), Math.min(x1, x2), Math.max(y1, y2), Math.max(x1, x2)]
  return box[2] - box[0] > 0 && box[3] - box[1] > 0 ? box : null
}

export interface ValidatedPage {
  items: ExtractedItem[]
  dropped: number
}

/** Coerce the model's JSON into ExtractedItems; items without characters and pinyin are dropped. */
export function validateItems(json: unknown): ValidatedPage {
  const raw = json && typeof json === 'object' ? (json as { items?: unknown }).items : undefined
  if (!Array.isArray(raw)) throw new ModelOutputError('The model reply has no "items" list.')
  const items: ExtractedItem[] = []
  let dropped = 0
  for (const r of raw) {
    const o = (r && typeof r === 'object' ? r : {}) as Record<string, unknown>
    const hanzi = str(o.hanzi)
    const pinyin = str(o.pinyin)
    if (!hanzi && !pinyin) {
      dropped++
      continue
    }
    const confidence = typeof o.confidence === 'number' && Number.isFinite(o.confidence) ? o.confidence : 0.5
    items.push({
      kind: o.kind === 'sentence' ? 'sentence' : 'word',
      hanzi,
      pinyin,
      meaning: str(o.meaning),
      partOfSpeech: str(o.partOfSpeech),
      notes: str(o.notes),
      hanziSource: source(o.hanziSource),
      pinyinSource: source(o.pinyinSource),
      meaningSource: source(o.meaningSource),
      imageBox: parseBox(o.imageBox),
      confidence: Math.min(1, Math.max(0, confidence)),
    })
  }
  return { items, dropped }
}

const ROLES: ReadonlySet<string> = new Set<WordRole>(['word', 'name', 'function', 'number'])
const confidenceOf = (v: unknown) => Math.min(1, Math.max(0, typeof v === 'number' && Number.isFinite(v) ? v : 0.5))

/** Zhuyin letters and tone marks: a reading aid that must never end up in a card. */
const ZHUYIN = /[㄀-ㄯㆠ-ㆿˊˇˋ˙]/g
export const stripZhuyin = (s: string) => s.replace(ZHUYIN, '')

/** Coerce a reading-page reply into sentences; empty sentences and words are dropped. */
export function validateReading(json: unknown): { sentences: ReadingItem[] } {
  const raw = json && typeof json === 'object' ? (json as { sentences?: unknown }).sentences : undefined
  if (!Array.isArray(raw)) throw new ModelOutputError('The model reply has no "sentences" list.')
  const sentences: ReadingItem[] = []
  for (const r of raw) {
    const o = (r && typeof r === 'object' ? r : {}) as Record<string, unknown>
    const text = stripZhuyin(str(o.text)).replace(/\s+/g, ' ').trim()
    const words: ReadingWord[] = []
    for (const w of Array.isArray(o.words) ? o.words : []) {
      const ow = (w && typeof w === 'object' ? w : {}) as Record<string, unknown>
      const hanzi = stripZhuyin(str(ow.hanzi)).replace(/\s+/g, '')
      if (!hanzi) continue
      words.push({
        hanzi,
        pinyin: str(ow.pinyin),
        meaning: str(ow.meaning),
        role: ROLES.has(str(ow.role)) ? (str(ow.role) as WordRole) : 'word',
        confidence: confidenceOf(ow.confidence),
      })
    }
    if (!text && !words.length) continue
    sentences.push({ text: text || words.map((w) => w.hanzi).join(''), pinyin: str(o.pinyin), meaning: str(o.meaning), words })
  }
  return { sentences }
}
