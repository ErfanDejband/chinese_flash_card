import { normalizePinyin } from '@/domain/pinyin/tones'
import { ModelOutputError, parseBox } from '@/import/ai/parse'
import type { JsonTask } from '@/import/ai/prompt'
import type { NormBox } from '@/import/types'
import { cellPosition, type MosaicLayout } from './mosaic'

/** Bump when a prompt or schema below changes. */
export const OBJECT_PROMPT_VERSION = 2

const WORD_RULES = `For each object:
- hanzi: the everyday word a person in Taiwan uses for it, in Traditional characters as used in Taiwan (never Simplified): 冰箱, 腳踏車, 垃圾桶, 冷氣, 拖鞋. Prefer the common general word (杯子) over a brand or a very rare term; use a more specific word only when it is just as common (馬克杯).
- pinyin: Hanyu Pinyin with tone marks, syllables joined without spaces (bēizi). The neutral tone has no mark.
- meaning: a short English meaning (1-4 words).
- confidence: a number from 0 to 1: how sure you are what the object is and that the word fits.`

/** TOCFL-style levels (Band A–C), as the AI estimates them for a word. */
export const WORD_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const
export type WordLevel = (typeof WORD_LEVELS)[number]

const NAME_SYSTEM = `A learner of Mandarin took a photo of things around them and picked some objects to learn the words for. You are given ONE image: a grid of numbered pictures, filled row by row from the top left. Each picture shows one object cut out of the photo, with a little of its surroundings. Reply with JSON only.

Name the object in the middle of each numbered picture. A guess from an object detector may be listed for a picture: it is often right but can be wrong or too general, so trust what you see.

For each object give 1 to 3 words, from general to specific, so the learner can choose:
- The "everyday" word, always first: the basic word a child or a beginner in Taiwan learns for this kind of thing (鞋子, 杯子, 椅子, 筆, 包包).
- Up to 2 "specific" words, only when the object clearly is a particular kind and the word is common in Taiwan (球鞋 or 運動鞋 for sneakers, 馬克杯 for a mug, 原子筆 for a ballpoint pen). Leave them out when the everyday word is already the exact name (遙控器, 滑鼠).

For each word:
- hanzi: Traditional characters as used in Taiwan (never Simplified).
- pinyin: Hanyu Pinyin with tone marks, syllables joined without spaces (bēizi). The neutral tone has no mark.
- meaning: a short English meaning (1-4 words).
- kind: "everyday" or "specific".
- level: your estimate of the TOCFL level at which learners usually meet the word: A1, A2, B1, B2, C1 or C2.

Also for each object:
- category: the broad group it belongs to, for sorting cards (衣物 clothing, 文具 stationery, 電器 appliances, 餐具 tableware, 家具 furniture, 食物 food, 玩具 toys, 交通工具 vehicles…), or null.
- confidence: a number from 0 to 1: how sure you are what the object is.
If you cannot tell what a picture shows, give no words and a low confidence.`

const NAME_SHAPE = `Reply with a JSON object of exactly this shape:
{"objects":[{"index":1,"words":[{"hanzi":"鞋子","pinyin":"xiézi","meaning":"shoes","kind":"everyday","level":"A1"},{"hanzi":"球鞋","pinyin":"qiúxié","meaning":"sneakers","kind":"specific","level":"A2"}],"category":{"hanzi":"衣物","pinyin":"yīwù","meaning":"clothing"},"confidence":0.9}]}`

const WORD_GEMINI = {
  type: 'OBJECT',
  properties: {
    hanzi: { type: 'STRING' },
    pinyin: { type: 'STRING' },
    meaning: { type: 'STRING' },
    kind: { type: 'STRING', enum: ['everyday', 'specific'] },
    level: { type: 'STRING', enum: [...WORD_LEVELS] },
  },
  required: ['hanzi', 'pinyin', 'meaning', 'kind', 'level'],
  propertyOrdering: ['hanzi', 'pinyin', 'meaning', 'kind', 'level'],
}
const WORD_JSON = {
  type: 'object',
  properties: {
    hanzi: { type: 'string' },
    pinyin: { type: 'string' },
    meaning: { type: 'string' },
    kind: { type: 'string', enum: ['everyday', 'specific'] },
    level: { type: 'string', enum: [...WORD_LEVELS] },
  },
  required: ['hanzi', 'pinyin', 'meaning', 'kind', 'level'],
  additionalProperties: false,
}
const CATEGORY_GEMINI = {
  type: 'OBJECT',
  properties: { hanzi: { type: 'STRING' }, pinyin: { type: 'STRING' }, meaning: { type: 'STRING' } },
  required: ['hanzi', 'pinyin', 'meaning'],
  nullable: true,
}
const CATEGORY_JSON = {
  anyOf: [
    {
      type: 'object',
      properties: { hanzi: { type: 'string' }, pinyin: { type: 'string' }, meaning: { type: 'string' } },
      required: ['hanzi', 'pinyin', 'meaning'],
      additionalProperties: false,
    },
    { type: 'null' },
  ],
}

/** Names the objects of a mosaic (vision/mosaic): per numbered cell, words from general to specific. */
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
          properties: { index: { type: 'INTEGER' }, words: { type: 'ARRAY', items: WORD_GEMINI }, category: CATEGORY_GEMINI, confidence: { type: 'NUMBER' } },
          required: ['index', 'words', 'category', 'confidence'],
          propertyOrdering: ['index', 'words', 'category', 'confidence'],
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
          properties: { index: { type: 'integer' }, words: { type: 'array', items: WORD_JSON }, category: CATEGORY_JSON, confidence: { type: 'number' } },
          required: ['index', 'words', 'category', 'confidence'],
          additionalProperties: false,
        },
      },
    },
    required: ['objects'],
    additionalProperties: false,
  },
}

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

/** One word the learner can pick for an object. */
export interface WordChoice {
  hanzi: string
  pinyin: string
  meaning: string
  /** The basic word a beginner learns first, or a more precise kind of it. */
  kind: 'everyday' | 'specific'
  level?: WordLevel
}

/** The word choices for one picture of the mosaic, everyday word first. */
export interface ObjectWords {
  words: WordChoice[]
  /** The broad group (衣物 clothing), used as a tag. */
  category?: { hanzi: string; pinyin: string; meaning: string }
  confidence: number
}

function wordChoice(w: unknown): WordChoice | null {
  const o = (w && typeof w === 'object' ? w : {}) as Record<string, unknown>
  const hanzi = text(o.hanzi)
  if (!hanzi) return null
  const level = WORD_LEVELS.find((l) => l === text(o.level).toUpperCase())
  return { hanzi, pinyin: normalizePinyin(text(o.pinyin)), meaning: text(o.meaning), kind: o.kind === 'specific' ? 'specific' : 'everyday', level }
}

/**
 * Word choices by 1-based picture number from an OBJECT_NAME_TASK reply: at most 3 distinct words,
 * everyday ones first (the first word counts as everyday when none is marked so). Later
 * duplicates of a number and numbers outside the mosaic are dropped.
 */
export function validateNames(json: unknown, count: number): Map<number, ObjectWords> {
  const names = new Map<number, ObjectWords>()
  for (const o of objectsOf(json)) {
    const index = o.index
    if (typeof index !== 'number' || !Number.isInteger(index) || index < 1 || index > count || names.has(index)) continue
    const all = (Array.isArray(o.words) ? o.words : []).map(wordChoice).filter((w): w is WordChoice => w !== null)
    const distinct = all.filter((w, i) => all.findIndex((v) => v.hanzi === w.hanzi) === i)
    const words = [...distinct.filter((w) => w.kind === 'everyday'), ...distinct.filter((w) => w.kind === 'specific')].slice(0, 3)
    if (words.length && !words.some((w) => w.kind === 'everyday')) words[0] = { ...words[0]!, kind: 'everyday' }
    const c = o.category && typeof o.category === 'object' ? (o.category as Record<string, unknown>) : undefined
    const category = c && text(c.hanzi) ? { hanzi: text(c.hanzi), pinyin: normalizePinyin(text(c.pinyin)), meaning: text(c.meaning) } : undefined
    const confidence = typeof o.confidence === 'number' ? Math.min(1, Math.max(0, o.confidence)) : 0
    names.set(index, { words, category, confidence })
  }
  return names
}

export type LearnerLevel = 'beginner' | 'intermediate' | 'advanced'

/**
 * Which word to preselect: beginners get the everyday word (the basic level people learn first);
 * intermediate learners a specific word when it is still early (A1–B1); advanced learners the
 * first specific word. Returns an index into `words`.
 */
export function defaultChoice(words: readonly WordChoice[], learner: LearnerLevel): number {
  const everyday = Math.max(0, words.findIndex((w) => w.kind === 'everyday'))
  if (learner === 'beginner') return everyday
  const specific = words.findIndex((w) => w.kind === 'specific' && (learner === 'advanced' || !w.level || w.level <= 'B1'))
  return specific >= 0 ? specific : everyday
}

/** Objects with a usable box from an OBJECT_FIND_TASK reply. */
export function validateFound(json: unknown): FoundObject[] {
  return objectsOf(json).flatMap((o) => {
    const box = parseBox(o.box)
    const n = named(o)
    return box && n.hanzi ? [{ ...n, box }] : []
  })
}
