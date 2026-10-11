import { parseModelJson } from '@/import/ai/parse'
import { withRetry, type RetryOptions } from '@/import/ai/retry'
import type { RequestUsage, VisionProvider } from '@/import/ai/types'
import type { NormBox } from '@/import/types'
import { LOCATE_TASK, locateInput, resolveBoxes, validateLocate } from './locate'
import { fallbackPlan, PLAN_BATCH, PLAN_TASK, planInput, validatePlan, type PlanWord } from './plan'
import { cellCount, layoutFor, sheetPrompt, variantsPrompt } from './sheet'
import type { PictureStyle } from './styles'
import type { PictureGenerator, PicturePlan } from './types'

export interface UsageSink {
  /** The planning/locating assistant (the import AI). */
  assistant?(model: string, usage: RequestUsage | undefined): void
  /** The image model. */
  image?(model: string, usage: RequestUsage | undefined): void
}

/**
 * Ask the import AI how to picture each word (in batches). Without an assistant, or when a
 * batch fails, words get the fallback plan (draw the meaning) so pictures can still be made.
 */
export async function planPictures(
  words: PlanWord[],
  assistant: VisionProvider | undefined,
  opts: RetryOptions & { usage?: UsageSink } = {},
): Promise<{ plans: PicturePlan[]; failed: boolean }> {
  if (!assistant) return { plans: words.map(fallbackPlan), failed: false }
  const plans: PicturePlan[] = []
  let failed = false
  for (let i = 0; i < words.length; i += PLAN_BATCH) {
    const batch = words.slice(i, i + PLAN_BATCH)
    try {
      plans.push(
        ...(await withRetry(async () => {
          const res = await assistant.extractPage({ textHint: planInput(batch), task: PLAN_TASK, signal: opts.signal })
          opts.usage?.assistant?.(res.model, res.usage)
          return validatePlan(parseModelJson(res.text), batch)
        }, opts)),
      )
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') throw e
      failed = true
      plans.push(...batch.map(fallbackPlan))
    }
  }
  return { plans, failed }
}

export interface SheetCell {
  /** What the cell should show (the plan's scene). */
  scene: string
  /** How the locate step names it: the word and its meaning. */
  label: string
}

export interface MadeSheet {
  image: Blob
  /** Crop box for each cell, in cell order. */
  boxes: NormBox[]
  /** Per cell: found by the locate step (true) or the plain grid cell (false). */
  located: boolean[]
  model: string
}

/**
 * Generate one sheet for `cells` (or four versions of one word with `variants`), then find each
 * picture on it with the assistant; any picture it can't place falls back to its grid cell.
 */
export async function makeSheet(
  cells: SheetCell[],
  style: PictureStyle,
  generator: PictureGenerator,
  assistant: VisionProvider | undefined,
  opts: RetryOptions & { variants?: boolean; usage?: UsageSink; toBase64(blob: Blob): Promise<string> },
): Promise<MadeSheet> {
  const scenes = cells.map((c) => c.scene)
  const prompt = opts.variants ? variantsPrompt(style, scenes[0]!) : sheetPrompt(style, scenes)
  const count = opts.variants ? 4 : cells.length
  const layout = layoutFor(count)
  const result = await withRetry(
    async () => {
      const r = await generator.generate({ prompt, aspect: layout.aspect, quality: style.quality, signal: opts.signal })
      opts.usage?.image?.(r.model, r.usage)
      return r
    },
    { ...opts, maxAttempts: Math.min(opts.maxAttempts ?? 3, 3) },
  )

  let found = new Map<number, NormBox>()
  // A single picture or four takes on one word: the grid is enough.
  if (assistant && cellCount(layout) > 1 && !opts.variants) {
    try {
      const imageBase64 = await opts.toBase64(result.image)
      found = await withRetry(async () => {
        const res = await assistant.extractPage({
          imageBase64,
          mime: result.image.type || 'image/png',
          textHint: locateInput(cells.map((c) => c.label)),
          task: LOCATE_TASK,
          signal: opts.signal,
        })
        opts.usage?.assistant?.(res.model, res.usage)
        return validateLocate(parseModelJson(res.text))
      }, opts)
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') throw e
      // The grid cells are used instead.
    }
  }
  const { boxes, located } = resolveBoxes(layout, count, found)
  return { image: result.image, boxes, located, model: result.model }
}
