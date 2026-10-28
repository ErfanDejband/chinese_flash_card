import type { JsonTask } from '../ai/prompt'

/** The list a task's reply is built around: `items` (vocabulary) or `sentences` (reading). */
const listKey = (task: JsonTask) => (task.id === 'reading' ? 'sentences' : 'items')

/**
 * The finished entries of a reply that is still arriving: the objects of its `items` list
 * (vocabulary) or `sentences` list (reading) that are complete so far. Copes with code fences,
 * prose before the JSON, and braces, quotes or escapes inside strings. Never throws.
 */
export function partialItems(text: string, task: JsonTask): Record<string, unknown>[] {
  const key = `"${listKey(task)}"`
  const items: Record<string, unknown>[] = []
  const start = text.indexOf('{')
  if (start < 0) return items
  let inString = false
  let escaped = false
  let stringStart = 0
  /** The last complete string and where it ended: the key, when a list follows it. */
  let lastString = ''
  let lastStringEnd = -1
  let depth = 0
  /** Depth inside the list once it is found; its entries open at this depth. */
  let listDepth = -1
  let itemStart = -1

  for (let i = start; i < text.length; i++) {
    const c = text[i]
    if (inString) {
      if (escaped) escaped = false
      else if (c === '\\') escaped = true
      else if (c === '"') {
        inString = false
        lastString = text.slice(stringStart, i + 1)
        lastStringEnd = i
      }
      continue
    }
    if (c === '"') {
      inString = true
      stringStart = i
    } else if (c === '{' || c === '[') {
      if (listDepth < 0 && c === '[' && lastString === key && /^\s*:\s*$/.test(text.slice(lastStringEnd + 1, i))) listDepth = depth + 1
      else if (c === '{' && depth === listDepth) itemStart = i
      depth++
    } else if (c === '}' || c === ']') {
      depth--
      if (listDepth >= 0 && depth === listDepth - 1) break // the list is closed
      if (c === '}' && depth === listDepth && itemStart >= 0) {
        const item = parseObject(text.slice(itemStart, i + 1))
        if (item) items.push(item)
        itemStart = -1
      }
    }
  }
  return items
}

function parseObject(json: string): Record<string, unknown> | undefined {
  try {
    const value: unknown = JSON.parse(json)
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined
  } catch {
    return undefined
  }
}

export interface LiveWord {
  hanzi: string
  pinyin: string
  meaning: string
}

export interface LiveReply {
  /** Finished items (vocabulary) or sentences (reading). */
  count: number
  /** Vocabulary: one per item. Reading: the words of the finished sentences, once each, without names, particles and numbers. */
  words: LiveWord[]
}

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
const word = (o: Record<string, unknown>): LiveWord => ({ hanzi: str(o.hanzi), pinyin: str(o.pinyin), meaning: str(o.meaning) })

/** What a reply still arriving has produced so far, for "words so far". */
export function liveReply(text: string, task: JsonTask): LiveReply {
  const entries = partialItems(text, task)
  if (task.id !== 'reading') return { count: entries.length, words: entries.map(word).filter((w) => w.hanzi || w.pinyin) }
  const words = new Map<string, LiveWord>()
  for (const sentence of entries) {
    for (const w of Array.isArray(sentence.words) ? (sentence.words as unknown[]) : []) {
      if (!w || typeof w !== 'object') continue
      const o = w as Record<string, unknown>
      const live = word(o)
      if (live.hanzi && (o.role === undefined || o.role === 'word') && !words.has(live.hanzi)) words.set(live.hanzi, live)
    }
  }
  return { count: entries.length, words: [...words.values()] }
}
