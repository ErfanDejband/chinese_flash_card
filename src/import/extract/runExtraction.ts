import type { NewMedia } from '@/data/repositories/media'
import type { BBox } from '@/domain/types'
import { parseModelJson, validateItems, validateReading } from '../ai/parse'
import { READING_TASK, VOCAB_TASK } from '../ai/prompt'
import { isAbort, withRetry } from '../ai/retry'
import { ProviderError, type PageResponse, type StreamProgress, type VisionProvider } from '../ai/types'
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

/**
 * One model request, timed (diagnostics, see lib/importTrace). `error` is set when it failed: the
 * request itself (no `response`), or its reply wasn't the expected JSON (`response` set).
 */
export interface AttemptEvent {
  page: number
  startedAt: number
  ms: number
  imageBytes: number
  response?: PageResponse
  error?: unknown
}

/**
 * What is happening to the page being read: rendering it, the request sent with nothing back yet,
 * the model reasoning (no visible text yet), the reply arriving, parsing and checking it (pinyin,
 * characters, picture crops), saving the drafts.
 */
export type ExtractionStage = 'preparing' | 'sending' | 'thinking' | 'writing' | 'checking' | 'saving'

export type ExtractionEvent =
  | { type: 'page-start'; page: number }
  | {
      type: 'page-stage'
      page: number
      stage: ExtractionStage
      /** Which try at the model this is, from 1; a retry after a wait counts up. */
      attempt: number
      /** The image sent to the model (with 'sending'), for a thumbnail. */
      preview?: Blob
      /** While the reply streams in ('thinking', 'writing'): reasoning tokens so far. */
      reasoningTokens?: number
      /** The visible reply so far ('writing'), or all of it ('checking'). */
      text?: string
    }
  /** Before a retry; `attempt` is the one that follows the wait. */
  | { type: 'waiting'; page: number; ms: number; reason: string; attempt: number; maxAttempts: number }
  | { type: 'page-done'; page: number; items: number }
  | { type: 'page-error'; page: number; message: string }

/** Streamed progress reaches onEvent at most this often (a new phase always goes through). */
const PROGRESS_INTERVAL_MS = 200

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
  /** Every model request with its timing, failed ones too. */
  onAttempt?(event: AttemptEvent): void
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
 * Each step is reported as a `page-stage` event, and the model's reply is streamed when there
 * is someone to show it to (`onEvent`).
 */
export async function runExtraction(pages: number[], deps: ExtractionDeps): Promise<{ done: number; failed: number }> {
  const reading = deps.mode === 'reading'
  const task = reading ? READING_TASK : VOCAB_TASK
  const maxAttempts = deps.maxAttempts ?? 4
  let done = 0
  let failed = 0

  /** Hands a streamed reply on to onEvent, a few times a second at most. */
  function progressReporter(page: number, attempt: number): ((p: StreamProgress) => void) | undefined {
    if (!deps.onEvent) return undefined
    let lastAt = 0
    let lastPhase = ''
    return (p) => {
      const now = Date.now()
      if (p.phase === lastPhase && now - lastAt < PROGRESS_INTERVAL_MS) return
      lastAt = now
      lastPhase = p.phase
      deps.onEvent?.({ type: 'page-stage', page, stage: p.phase, attempt, reasoningTokens: p.reasoningTokens, text: p.text })
    }
  }

  /** Ask the model about a rendered page (retrying as needed) and validate its reply. */
  async function extractWithRetry<T>(page: number, rendered: RenderedPage, imageBase64: string, validate: (json: unknown) => T) {
    const imageBytes = rendered.aiImage.size
    let attempt = 0
    try {
      const result = await withRetry(
        async () => {
          attempt++
          deps.onEvent?.({ type: 'page-stage', page, stage: 'sending', attempt, preview: rendered.aiImage })
          const startedAt = Date.now()
          let response: PageResponse | undefined
          try {
            response = await deps.provider.extractPage({
              imageBase64,
              mime: rendered.aiImage.type || 'image/jpeg',
              textHint: rendered.textHint,
              task,
              signal: deps.signal,
              onProgress: progressReporter(page, attempt),
            })
            deps.onEvent?.({ type: 'page-stage', page, stage: 'checking', attempt, text: response.text })
            const value = validate(parseModelJson(response.text))
            deps.onAttempt?.({ page, startedAt, ms: Date.now() - startedAt, imageBytes, response })
            return { ...response, value }
          } catch (error) {
            deps.onAttempt?.({ page, startedAt, ms: Date.now() - startedAt, imageBytes, response, error })
            throw error
          }
        },
        {
          maxAttempts,
          signal: deps.signal,
          sleep: deps.sleep,
          random: deps.random,
          onWait: (ms, reason) => deps.onEvent?.({ type: 'waiting', page, ms, reason, attempt: attempt + 1, maxAttempts }),
        },
      )
      return { ...result, attempt }
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
      deps.onEvent?.({ type: 'page-stage', page, stage: 'preparing', attempt: 1 })
      const rendered = await deps.render(page)
      const imageBase64 = await deps.toBase64(rendered.aiImage)
      const base = { rendered, promptVersion: task.version }
      let drafts: PageDraft[]
      if (reading) {
        const result = await extractWithRetry(page, rendered, imageBase64, validateReading)
        const { drafts: words, sentences } = readingDrafts(result.value.sentences, deps.context)
        drafts = words
        deps.onEvent?.({ type: 'page-stage', page, stage: 'saving', attempt: result.attempt })
        await deps.store.saveResult({ ...base, model: result.model, raw: result.text, drafts, reading: sentences })
      } else {
        const result = await extractWithRetry(page, rendered, imageBase64, validateItems)
        drafts = []
        for (const fields of postprocess(result.value.items, deps.context)) {
          const crop = fields.imageBox ? await deps.crop(rendered, fields.imageBox) : null
          drafts.push(
            crop && fields.imageBox
              ? { ...fields, crop, sourceBox: boxToPageUnits(fields.imageBox, rendered.pointWidth, rendered.pointHeight) }
              : { ...fields, imageBox: null },
          )
        }
        deps.onEvent?.({ type: 'page-stage', page, stage: 'saving', attempt: result.attempt })
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
