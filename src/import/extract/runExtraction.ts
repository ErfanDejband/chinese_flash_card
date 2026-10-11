import type { NewMedia } from '@/data/repositories/media'
import type { BBox } from '@/domain/types'
import { parseModelJson, validateItems, validateReading } from '../ai/parse'
import { READING_TASK, VOCAB_TASK } from '../ai/prompt'
import { isAbort, withRetry } from '../ai/retry'
import { ProviderError, type VisionProvider } from '../ai/types'
import { boxToPageUnits } from '../pdf/boxes'
import type { DraftFields, ImportMode, NormBox, ReadingSentence } from '../types'
import { postprocess, type PostprocessContext } from './postprocess'
import { readingDrafts } from './reading'

/** A rendered page: the full image is kept for cropping, the smaller one is sent to the model. */
export interface RenderedPage {
  page: number
  image: Blob
  width: number
  height: number
  /** Page size in PDF points. */
  pointWidth: number
  pointHeight: number
  aiImage: Blob
  textHint: string
}

export interface PageDraft extends DraftFields {
  crop?: NewMedia
  sourceBox?: BBox
}

export interface PageResult {
  rendered: RenderedPage
  model: string
  raw: string
  /** Version of the prompt that produced the reply. */
  promptVersion: number
  drafts: PageDraft[]
  /** Reading pages: the sentences, split into words, for the reader. */
  reading?: ReadingSentence[]
}

/** Persistence used by the run (implemented by the imports repository). */
export interface ExtractionStore {
  markRunning(page: number): Promise<void>
  saveResult(result: PageResult): Promise<void>
  markError(page: number, message: string): Promise<void>
}

export type ExtractionEvent =
  | { type: 'page-start'; page: number }
  | { type: 'waiting'; page: number; ms: number; reason: string }
  | { type: 'page-done'; page: number; items: number }
  | { type: 'page-error'; page: number; message: string }

export interface ExtractionDeps {
  provider: VisionProvider
  /** Vocabulary pages by default. */
  mode?: ImportMode
  render(page: number): Promise<RenderedPage>
  crop(rendered: RenderedPage, box: NormBox): Promise<NewMedia | null>
  toBase64(blob: Blob): Promise<string>
  store: ExtractionStore
  context: PostprocessContext
  onEvent?(event: ExtractionEvent): void
  signal?: AbortSignal
  sleep?(ms: number, signal?: AbortSignal): Promise<void>
  /** Attempts per page for transient failures (default 4). */
  maxAttempts?: number
  random?: () => number
}

/** Stops the whole run: retrying other pages cannot help (bad key, quota exhausted). */
export class FatalExtractionError extends Error {}

/**
 * Process pages one at a time (free tiers allow few requests per minute): render → model →
 * validate → post-process → crop pictures → persist. Transient failures are retried with
 * backoff (honouring Retry-After); a page that still fails is recorded and the run continues.
 */
export async function runExtraction(pages: number[], deps: ExtractionDeps): Promise<{ done: number; failed: number }> {
  const reading = deps.mode === 'reading'
  const task = reading ? READING_TASK : VOCAB_TASK
  let done = 0
  let failed = 0

  async function extractWithRetry<T>(page: number, request: () => Promise<{ text: string; model: string }>, validate: (json: unknown) => T) {
    try {
      return await withRetry(
        async () => {
          const response = await request()
          return { ...response, value: validate(parseModelJson(response.text)) }
        },
        {
          maxAttempts: deps.maxAttempts,
          signal: deps.signal,
          sleep: deps.sleep,
          random: deps.random,
          onWait: (ms, reason) => deps.onEvent?.({ type: 'waiting', page, ms, reason }),
        },
      )
    } catch (e) {
      if (e instanceof ProviderError && e.kind === 'quota') throw new FatalExtractionError(`${e.message} Resume the remaining pages tomorrow.`)
      if (e instanceof ProviderError && e.kind === 'rate-limit') throw new FatalExtractionError(`${e.message} Try again later.`)
      throw e
    }
  }

  for (const page of pages) {
    if (deps.signal?.aborted) throw deps.signal.reason
    deps.onEvent?.({ type: 'page-start', page })
    await deps.store.markRunning(page)
    try {
      const rendered = await deps.render(page)
      const imageBase64 = await deps.toBase64(rendered.aiImage)
      const request = () =>
        deps.provider.extractPage({
          imageBase64,
          mime: rendered.aiImage.type || 'image/jpeg',
          textHint: rendered.textHint,
          task,
          signal: deps.signal,
        })
      const base = { rendered, promptVersion: task.version }
      let drafts: PageDraft[]
      if (reading) {
        const result = await extractWithRetry(page, request, validateReading)
        const { drafts: words, sentences } = readingDrafts(result.value.sentences, deps.context)
        drafts = words
        await deps.store.saveResult({ ...base, model: result.model, raw: result.text, drafts, reading: sentences })
      } else {
        const result = await extractWithRetry(page, request, validateItems)
        drafts = []
        for (const fields of postprocess(result.value.items, deps.context)) {
          const crop = fields.imageBox ? await deps.crop(rendered, fields.imageBox) : null
          drafts.push(
            crop && fields.imageBox
              ? { ...fields, crop, sourceBox: boxToPageUnits(fields.imageBox, rendered.pointWidth, rendered.pointHeight) }
              : { ...fields, imageBox: null },
          )
        }
        await deps.store.saveResult({ ...base, model: result.model, raw: result.text, drafts })
      }
      done++
      deps.onEvent?.({ type: 'page-done', page, items: drafts.length })
    } catch (e) {
      if (isAbort(e)) throw e
      const message = e instanceof Error ? e.message : String(e)
      await deps.store.markError(page, message)
      failed++
      deps.onEvent?.({ type: 'page-error', page, message })
      if (e instanceof FatalExtractionError) throw e
      // A rejected key or an unknown model fails every page the same way.
      if (e instanceof ProviderError && (e.kind === 'auth' || e.status === 404)) throw new FatalExtractionError(e.message)
    }
  }
  return { done, failed }
}
