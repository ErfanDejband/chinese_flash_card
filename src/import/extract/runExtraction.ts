import type { NewMedia } from '@/data/repositories/media'
import type { BBox } from '@/domain/types'
import { ModelOutputError, parseModelJson, validateItems } from '../ai/parse'
import { ProviderError, type VisionProvider } from '../ai/types'
import { boxToPageUnits } from '../pdf/boxes'
import type { DraftFields, NormBox } from '../types'
import { postprocess, type PostprocessContext } from './postprocess'

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
  drafts: PageDraft[]
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

function defaultSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason)
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer)
        reject(signal.reason)
      },
      { once: true },
    )
  })
}

const isAbort = (e: unknown) => e instanceof DOMException && e.name === 'AbortError'

/**
 * Process pages one at a time (free tiers allow few requests per minute): render → model →
 * validate → post-process → crop pictures → persist. Transient failures are retried with
 * backoff (honouring Retry-After); a page that still fails is recorded and the run continues.
 */
export async function runExtraction(pages: number[], deps: ExtractionDeps): Promise<{ done: number; failed: number }> {
  const sleep = deps.sleep ?? defaultSleep
  const random = deps.random ?? Math.random
  const maxAttempts = deps.maxAttempts ?? 4
  let done = 0
  let failed = 0

  async function extractWithRetry(page: number, request: () => Promise<{ text: string; model: string }>) {
    for (let attempt = 1; ; attempt++) {
      try {
        const response = await request()
        return { ...response, ...validateItems(parseModelJson(response.text)) }
      } catch (e) {
        if (isAbort(e)) throw e
        const badOutput = e instanceof ModelOutputError || (e instanceof ProviderError && e.kind === 'bad-response')
        const transient = e instanceof ProviderError && e.transient
        const canRetry = attempt < maxAttempts && (transient || (badOutput && attempt < 2))
        if (!canRetry) {
          if (e instanceof ProviderError && e.kind === 'quota') {
            throw new FatalExtractionError(`${e.message} Resume the remaining pages tomorrow.`)
          }
          if (e instanceof ProviderError && e.kind === 'rate-limit') {
            throw new FatalExtractionError(`${e.message} Try again later.`)
          }
          throw e
        }
        const rateLimited = e instanceof ProviderError && e.kind === 'rate-limit'
        const base = rateLimited ? 10_000 : 1_000
        const ms =
          e instanceof ProviderError && e.retryAfterMs !== undefined
            ? e.retryAfterMs + 250
            : Math.round(Math.min(120_000, base * 2 ** (attempt - 1)) * (0.75 + random() / 2))
        deps.onEvent?.({ type: 'waiting', page, ms, reason: rateLimited ? 'rate limit' : 'retrying' })
        await sleep(ms, deps.signal)
      }
    }
  }

  for (const page of pages) {
    if (deps.signal?.aborted) throw deps.signal.reason
    deps.onEvent?.({ type: 'page-start', page })
    await deps.store.markRunning(page)
    try {
      const rendered = await deps.render(page)
      const imageBase64 = await deps.toBase64(rendered.aiImage)
      const result = await extractWithRetry(page, () =>
        deps.provider.extractPage({
          imageBase64,
          mime: rendered.aiImage.type || 'image/jpeg',
          textHint: rendered.textHint,
          signal: deps.signal,
        }),
      )
      const drafts: PageDraft[] = []
      for (const fields of postprocess(result.items, deps.context)) {
        const crop = fields.imageBox ? await deps.crop(rendered, fields.imageBox) : null
        drafts.push(
          crop && fields.imageBox
            ? { ...fields, crop, sourceBox: boxToPageUnits(fields.imageBox, rendered.pointWidth, rendered.pointHeight) }
            : { ...fields, imageBox: null },
        )
      }
      await deps.store.saveResult({ rendered, model: result.model, raw: result.text, drafts })
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
