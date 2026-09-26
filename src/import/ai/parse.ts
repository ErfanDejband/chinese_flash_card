import type { ExtractedItem, FieldSource, NormBox } from '../types'

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
