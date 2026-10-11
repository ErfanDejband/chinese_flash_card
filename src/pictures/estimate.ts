import type { PictureQuality, PictureService, SheetAspect } from './types'

/**
 * List prices for one image, used to estimate before a run (checked 2026-10-11 against the
 * OpenAI image guide and the Gemini pricing page). OpenRouter reports the real cost of each
 * request; the others are estimated from these tables afterwards too. Update when prices change.
 */

/** Output image tokens of GPT Image models before gpt-image-2 (1024×1024 and 1536×1024). */
const OPENAI_TOKENS: Record<PictureQuality, Record<SheetAspect, number>> = {
  low: { '1:1': 272, '3:2': 400 },
  medium: { '1:1': 1056, '3:2': 1568 },
}

/** USD per image by model, quality and shape. */
const OPENAI_USD: Record<string, Record<PictureQuality, Record<SheetAspect, number>>> = {
  'gpt-image-1-mini': { low: { '1:1': 0.005, '3:2': 0.006 }, medium: { '1:1': 0.011, '3:2': 0.015 } },
  'gpt-image-1': { low: { '1:1': 0.011, '3:2': 0.016 }, medium: { '1:1': 0.042, '3:2': 0.063 } },
  'gpt-image-1.5': { low: { '1:1': 0.009, '3:2': 0.013 }, medium: { '1:1': 0.034, '3:2': 0.05 } },
  'gpt-image-2': { low: { '1:1': 0.006, '3:2': 0.005 }, medium: { '1:1': 0.053, '3:2': 0.041 } },
}
const OPENAI_WITH_TOKEN_TABLE = new Set(['gpt-image-1-mini', 'gpt-image-1', 'gpt-image-1.5'])

/** Gemini image models at 1K: one price whatever the style or shape. */
const GEMINI: Record<string, { usd: number; tokens: number }> = {
  'gemini-nano-banana-2.1': { usd: 0.0336, tokens: 1120 },
  'gemini-3.1-flash-lite-image': { usd: 0.0336, tokens: 1120 },
  'gemini-3.1-flash-image': { usd: 0.067, tokens: 1120 },
  'gemini-3-pro-image': { usd: 0.134, tokens: 1120 },
  'gemini-2.5-flash-image': { usd: 0.039, tokens: 1290 },
}

export interface SheetCost {
  /** Estimated USD for one generated image (one sheet). */
  usd?: number
  /** Output image tokens, where the provider bills by token and the count is known. */
  tokens?: number
}

/** `openai/gpt-image-1-mini` → `gpt-image-1-mini`; drops `-preview`. */
const baseModel = (model: string) => model.replace(/^[^/]+\//, '').replace(/-preview$/, '')

/** Estimated cost of one sheet; empty when the model isn't in the tables (the cost is shown after). */
export function sheetCost(service: PictureService, model: string, aspect: SheetAspect, quality: PictureQuality): SheetCost {
  const id = baseModel(model)
  const openai = service === 'openai' || (service === 'openrouter' && model.startsWith('openai/'))
  const gemini = service === 'gemini' || (service === 'openrouter' && model.startsWith('google/'))
  if (openai && OPENAI_USD[id]) {
    return { usd: OPENAI_USD[id][quality][aspect], tokens: OPENAI_WITH_TOKEN_TABLE.has(id) ? OPENAI_TOKENS[quality][aspect] : undefined }
  }
  if (gemini && GEMINI[id]) return { usd: GEMINI[id].usd, tokens: GEMINI[id].tokens }
  return {}
}

/** Estimated USD for the image tokens a provider reported (OpenAI and Gemini don't return a cost). */
export function costFromUsage(service: PictureService, model: string, aspect: SheetAspect, quality: PictureQuality): number | undefined {
  return service === 'openrouter' ? undefined : sheetCost(service, model, aspect, quality).usd
}
