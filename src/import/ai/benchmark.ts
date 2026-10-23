import { normalizePinyin } from '@/domain/pinyin/tones'
import { SAMPLE_ITEMS } from '../demo/samplePage'
import { requestJson } from './http'
import { FREE_ROUTER_MODEL, OPENROUTER_BASE_URL } from './openrouterAuth'
import { parseModelJson, validateItems } from './parse'
import type { FetchLike } from './types'

/**
 * "Test the free models" (Settings → AI usage): the import demo's sample page goes to each free
 * model that can read images. The page and its right answer are always the same, so models can be
 * compared on speed and accuracy.
 */

/** A model from OpenRouter's public `/models` list (the fields used here). */
export interface ListedModel {
  id: string
  name?: string
  architecture?: { input_modalities?: string[]; output_modalities?: string[] }
  supported_parameters?: string[]
  reasoning?: { mandatory?: boolean; default_enabled?: boolean; supported_efforts?: string[] }
}

export interface BenchCandidate {
  /** The model, plus "reasoning off" or which router try. */
  label: string
  model: string
  extraBody?: Record<string, unknown>
}

/** Free models that can't do this job: classifiers, music, speech. */
const NOT_A_READER = /safety|guard|moderation|lyria|music|embed|tts|whisper|transcri/i

export const ROUTER_TRIES = 2
export const MAX_TEST_REQUESTS = 12

/** OpenRouter's model list; public, no key needed. */
export async function fetchListedModels(fetchImpl: FetchLike = (url, init) => fetch(url, init), signal?: AbortSignal): Promise<ListedModel[]> {
  const body = (await requestJson(fetchImpl, `${OPENROUTER_BASE_URL}/models`, { signal })) as { data?: ListedModel[] }
  return (body.data ?? []).filter((m) => typeof m?.id === 'string')
}

/** Free (`:free`), reads images, writes text, and is a general model. */
export function freeVisionModels(models: ListedModel[]): ListedModel[] {
  return models.filter((m) => {
    const arch = m.architecture
    return (
      m.id.endsWith(':free') &&
      (arch?.input_modalities ?? []).includes('image') &&
      (arch?.output_modalities === undefined || arch.output_modalities.includes('text')) &&
      !NOT_A_READER.test(`${m.id} ${m.name ?? ''}`)
    )
  })
}

/**
 * What the test sends: each free vision model once as it comes; then, with the requests left, again
 * with reasoning switched off where it may be on; and the free router a few times, to see what it picks.
 */
export function benchmarkCandidates(models: ListedModel[], max = MAX_TEST_REQUESTS): BenchCandidate[] {
  const direct: BenchCandidate[] = []
  const reasoningOff: BenchCandidate[] = []
  for (const m of freeVisionModels(models)) {
    direct.push({ label: m.id, model: m.id })
    const r = m.reasoning
    // "Optional" reasoning is often on by default (nemotron-3.5-super-vl and dots-3 thought for 90% of their tokens).
    const canReason = r !== undefined || (m.supported_parameters ?? []).includes('reasoning')
    if (canReason && !r?.mandatory && r?.default_enabled !== false) {
      const reasoning = r?.supported_efforts?.includes('none') ? { effort: 'none' } : { enabled: false }
      reasoningOff.push({ label: `${m.id} · reasoning off`, model: m.id, extraBody: { reasoning } })
    }
  }
  const router = Array.from({ length: ROUTER_TRIES }, (_, i) => ({ label: `${FREE_ROUTER_MODEL} · try ${i + 1}`, model: FREE_ROUTER_MODEL }))
  return [...[...direct, ...reasoningOff].slice(0, Math.max(0, max - ROUTER_TRIES)), ...router]
}

export interface BenchScore {
  /** Sample words found with the right (Traditional) characters. */
  found: number
  pinyinRight: number
  total: number
  /** Items that are not sample words (wrong or Simplified characters, extra text). */
  other: number
}

const compactPinyin = (p: string) => normalizePinyin(p).replace(/\s+/g, '').toLowerCase()

/** Compare a reply with the sample page's words. Throws ModelOutputError when the reply isn't the expected JSON. */
export function scoreSampleReply(text: string): BenchScore {
  const { items } = validateItems(parseModelJson(text))
  let found = 0
  let pinyinRight = 0
  for (const expected of SAMPLE_ITEMS) {
    const item = items.find((i) => i.hanzi.trim() === expected.hanzi)
    if (!item) continue
    found++
    if (compactPinyin(item.pinyin) === compactPinyin(expected.pinyin)) pinyinRight++
  }
  const known = new Set(SAMPLE_ITEMS.map((s) => s.hanzi))
  return { found, pinyinRight, total: SAMPLE_ITEMS.length, other: items.filter((i) => !known.has(i.hanzi.trim())).length }
}
