import { ModelOutputError } from '@/import/ai/parse'
import type { JsonTask } from '@/import/ai/prompt'
import type { Example } from '@/domain/types'
import type { PicturePlan } from './types'

/** Bump when the planning prompt or schema changes. */
export const PLAN_PROMPT_VERSION = 1

/** Words per planning request. */
export const PLAN_BATCH = 30

export interface PlanWord {
  hanzi: string
  pinyin: string
  meaning?: string
  example?: Example
}

const SYSTEM = `You help make pictures for the flashcards of an English-speaking learner of Mandarin Chinese. The picture is shown as the question ("what is this in Chinese?"), so it must show the meaning on its own, without any text. Reply with JSON only.

For each numbered word:
- picturable: true if one simple picture shows the meaning clearly (objects, animals, people, places, food, most actions, clear qualities like "hot" or "big"); false for grammar words, particles, measure words, pronouns, numbers, most adverbs and other abstract words (很, 因為, 的, 了, 隻, 他, 還).
- scene: a short, concrete English description of one picture that shows the meaning (at most 20 words). Show the thing itself; for an action, show someone doing it; for a quality, show an obvious example. Never ask for text, letters or numbers in the picture. Write a scene even when picturable is false (it may be drawn anyway).
- emoji: the single emoji that best shows the meaning, or "" if none fits.
- searchQuery: 1 to 3 English words to find a photo of it.

Use the example sentence, when given, to pick the right sense of the word. Return one entry per word, with its number as "index".`

const JSON_SHAPE = `Reply with a JSON object of exactly this shape:
{"words":[{"index":1,"picturable":true,"scene":"a small brown puppy sitting and wagging its tail","emoji":"🐶","searchQuery":"puppy"},{"index":2,"picturable":false,"scene":"a big thumbs-up","emoji":"👍","searchQuery":"very"}]}`

/** The words, numbered, as the user message. */
export function planInput(words: PlanWord[]): string {
  return words
    .map((w, i) => {
      const parts = [`${i + 1}. ${w.hanzi} (${w.pinyin})`]
      if (w.meaning) parts.push(`: ${w.meaning}`)
      if (w.example) parts.push(` — example: ${w.example.hanzi}${w.example.meaning ? ` (${w.example.meaning})` : ''}`)
      return parts.join('')
    })
    .join('\n')
}

const ITEM_PROPS = ['index', 'picturable', 'scene', 'emoji', 'searchQuery']

export const PLAN_TASK: JsonTask = {
  id: 'picture-plan',
  version: PLAN_PROMPT_VERSION,
  system: SYSTEM,
  user: (words) => `Plan a picture for each of these words:\n${words}`,
  jsonShape: JSON_SHAPE,
  geminiSchema: {
    type: 'OBJECT',
    properties: {
      words: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            index: { type: 'INTEGER' },
            picturable: { type: 'BOOLEAN' },
            scene: { type: 'STRING' },
            emoji: { type: 'STRING' },
            searchQuery: { type: 'STRING' },
          },
          required: ITEM_PROPS,
          propertyOrdering: ITEM_PROPS,
        },
      },
    },
    required: ['words'],
  },
  jsonSchema: {
    type: 'object',
    properties: {
      words: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            index: { type: 'integer' },
            picturable: { type: 'boolean' },
            scene: { type: 'string' },
            emoji: { type: 'string' },
            searchQuery: { type: 'string' },
          },
          required: ITEM_PROPS,
          additionalProperties: false,
        },
      },
    },
    required: ['words'],
    additionalProperties: false,
  },
}

/** Used when there is no reply for a word (or no AI to ask): draw what the meaning says. */
export function fallbackPlan(w: PlanWord): PicturePlan {
  const meaning = w.meaning?.trim() || w.hanzi
  return { picturable: true, scene: meaning, emoji: '', searchQuery: meaning }
}

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

/** One plan per word, in order; words the reply left out get the fallback. */
export function validatePlan(json: unknown, words: PlanWord[]): PicturePlan[] {
  const raw = json && typeof json === 'object' ? (json as { words?: unknown }).words : undefined
  if (!Array.isArray(raw)) throw new ModelOutputError('The model reply has no "words" list.')
  const byIndex = new Map<number, PicturePlan>()
  for (const r of raw) {
    const o = (r && typeof r === 'object' ? r : {}) as Record<string, unknown>
    const index = typeof o.index === 'number' ? o.index : NaN
    const scene = str(o.scene)
    if (!Number.isInteger(index) || index < 1 || index > words.length || !scene) continue
    // One emoji (a grapheme), never text.
    const emoji = [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(str(o.emoji))][0]?.segment ?? ''
    byIndex.set(index, {
      picturable: o.picturable !== false,
      scene,
      emoji: /\p{Extended_Pictographic}/u.test(emoji) ? emoji : '',
      searchQuery: str(o.searchQuery) || words[index - 1]!.meaning?.trim() || '',
    })
  }
  return words.map((w, i) => byIndex.get(i + 1) ?? fallbackPlan(w))
}
