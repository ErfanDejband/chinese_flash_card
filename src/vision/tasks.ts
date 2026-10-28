import { normalizePinyin } from '@/domain/pinyin/tones'
import { ModelOutputError, parseBox } from '@/import/ai/parse'
import type { JsonTask } from '@/import/ai/prompt'
import type { NormBox } from '@/import/types'
import { cellPosition, type MosaicLayout } from './mosaic'

/** Bump when a prompt or schema below changes. */
export const OBJECT_PROMPT_VERSION = 1

const WORD_RULES = `For each object:
- hanzi: the everyday word a person in Taiwan uses for it, in Traditional characters as used in Taiwan (never Simplified): 冰箱, 腳踏車, 垃圾桶, 冷氣, 拖鞋. Prefer the common general word (杯子) over a brand or a very rare term; use a more specific word only when it is just as common (馬克杯).
- pinyin: Hanyu Pinyin with tone marks, syllables joined without spaces (bēizi). The neutral tone has no mark.
- meaning: a short English meaning (1-4 words).
- confidence: a number from 0 to 1: how sure you are what the object is and that the word fits.`

const NAME_SYSTEM = `A learner of Mandarin took a photo of things around them and picked some objects to learn the words for. You are given ONE image: a grid of numbered pictures, filled row by row from the top left. Each picture shows one object cut out of the photo, with a little of its surroundings. Reply with JSON only.

Name the object in the middle of each numbered picture. A guess from an object detector may be listed for a picture: it is often right but can be wrong or too general, so trust what you see. If you cannot tell what a picture shows, use an empty hanzi and a low confidence.

${WORD_RULES}`

const NAME_SHAPE = `Reply with a JSON object of exactly this shape:
{"objects":[{"index":1,"hanzi":"杯子","pinyin":"bēizi","meaning":"cup","confidence":0.9}]}`

const NAMED_PROPERTIES = {
  hanzi: { type: 'STRING' },
  pinyin: { type: 'STRING' },
  meaning: { type: 'STRING' },
  confidence: { type: 'NUMBER' },
}
const namedJson = {
  hanzi: { type: 'string' },
  pinyin: { type: 'string' },
  meaning: { type: 'string' },
  confidence: { type: 'number' },
}

/** Names the objects of a mosaic (vision/mosaic), one per numbered cell. */
export const OBJECT_NAME_TASK: JsonTask = {
  id: 'object-name',
  version: OBJECT_PROMPT_VERSION,
  system: NAME_SYSTEM,
  user: (list) => `Name the object in each numbered picture:\n${list}`,
  jsonShape: NAME_SHAPE,
  geminiSchema: {
    type: 'OBJECT',
    properties: {
      objects: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: { index: { type: 'INTEGER' }, ...NAMED_PROPERTIES },
          required: ['index', 'hanzi', 'pinyin', 'meaning', 'confidence'],
          propertyOrdering: ['index', 'hanzi', 'pinyin', 'meaning', 'confidence'],
        },
      },
    },
    required: ['objects'],
  },
  jsonSchema: {
    type: 'object',
    properties: {
      objects: {
        type: 'array',
        items: {
          type: 'object',
          properties: { index: { type: 'integer' }, ...namedJson },
          required: ['index', 'hanzi', 'pinyin', 'meaning', 'confidence'],
          additionalProperties: false,
        },
      },
    },
    required: ['objects'],
    additionalProperties: false,
  },
}

/** The user message's list: where each picture sits and the detector's guess, if any. */
export function nameInput(layout: MosaicLayout, guesses: readonly (string | undefined)[]): string {
  return guesses
    .map((guess, i) => {
      const { row, col } = cellPosition(layout, i)
      return `${i + 1}. row ${row}, column ${col}${guess ? ` · detector's guess: ${guess}` : ''}`
    })
    .join('\n')
}

const FIND_SYSTEM = `A learner of Mandarin took a photo of things around them and wants to learn the words for the objects in it. Find the distinct everyday objects in the photo (at most 20, the clearest first; skip people's faces, text and tiny or blurry things) and name each one. Reply with JSON only.

- box: [ymin, xmin, ymax, xmax] normalised to 0-1000 relative to the whole image, tight around the object.

${WORD_RULES}`

const FIND_SHAPE = `Reply with a JSON object of exactly this shape:
{"objects":[{"hanzi":"杯子","pinyin":"bēizi","meaning":"cup","box":[420,130,610,260],"confidence":0.9}]}`

/** Finds and names objects in a whole photo: the "AI only" way the lab compares against. */
export const OBJECT_FIND_TASK: JsonTask = {
  id: 'object-find',
  version: OBJECT_PROMPT_VERSION,
  system: FIND_SYSTEM,
  user: () => 'Find and name the objects in this photo.',
  jsonShape: FIND_SHAPE,
  geminiSchema: {
    type: 'OBJECT',
    properties: {
      objects: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: { ...NAMED_PROPERTIES, box: { type: 'ARRAY', items: { type: 'INTEGER' } } },
          required: ['hanzi', 'pinyin', 'meaning', 'box', 'confidence'],
          propertyOrdering: ['hanzi', 'pinyin', 'meaning', 'box', 'confidence'],
        },
      },
    },
    required: ['objects'],
  },
  jsonSchema: {
    type: 'object',
    properties: {
      objects: {
        type: 'array',
        items: {
          type: 'object',
          properties: { ...namedJson, box: { type: 'array', items: { type: 'integer' } } },
          required: ['hanzi', 'pinyin', 'meaning', 'box', 'confidence'],
          additionalProperties: false,
        },
      },
    },
    required: ['objects'],
    additionalProperties: false,
  },
}

export interface NamedObject {
  hanzi: string
  pinyin: string
  meaning: string
  confidence: number
}

export interface FoundObject extends NamedObject {
  box: NormBox
}

const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

function named(o: Record<string, unknown>): NamedObject {
  const confidence = typeof o.confidence === 'number' ? Math.min(1, Math.max(0, o.confidence)) : 0
  return { hanzi: text(o.hanzi), pinyin: normalizePinyin(text(o.pinyin)), meaning: text(o.meaning), confidence }
}

function objectsOf(json: unknown): Record<string, unknown>[] {
  const raw = json && typeof json === 'object' ? (json as { objects?: unknown }).objects : undefined
  if (!Array.isArray(raw)) throw new ModelOutputError('The model reply has no "objects" list.')
  return raw.map((r) => (r && typeof r === 'object' ? r : {}) as Record<string, unknown>)
}

/** Names by 1-based picture number from an OBJECT_NAME_TASK reply (later duplicates and bad numbers dropped). */
export function validateNames(json: unknown, count: number): Map<number, NamedObject> {
  const names = new Map<number, NamedObject>()
  for (const o of objectsOf(json)) {
    const index = o.index
    if (typeof index === 'number' && Number.isInteger(index) && index >= 1 && index <= count && !names.has(index)) names.set(index, named(o))
  }
  return names
}

/** Objects with a usable box from an OBJECT_FIND_TASK reply. */
export function validateFound(json: unknown): FoundObject[] {
  return objectsOf(json).flatMap((o) => {
    const box = parseBox(o.box)
    const n = named(o)
    return box && n.hanzi ? [{ ...n, box }] : []
  })
}
