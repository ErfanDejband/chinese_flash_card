import { listActiveCards } from '@/data/repositories/cards'
import {
  getImport,
  listDrafts,
  listImportPages,
  markPageError,
  markPageRunning,
  requeueInterrupted,
  savePageResult,
} from '@/data/repositories/imports'
import { knownHanziSet } from '@/data/repositories/knownWords'
import { createProvider, serviceLabel } from '@/import/ai/createProvider'
import { bytesToBase64 } from '@/import/ai/http'
import { openRouterGenerationStats } from '@/import/ai/openrouterAuth'
import { READING_TASK, VOCAB_TASK, type JsonTask } from '@/import/ai/prompt'
import type { ProviderConfig, VisionProvider } from '@/import/ai/types'
import { liveReply, type LiveWord } from '@/import/extract/partial'
import { FatalExtractionError, runExtraction, type ExtractionEvent, type ExtractionStage } from '@/import/extract/runExtraction'
import { loadSimplifiedDetector } from '@/import/extract/traditional'
import { cropFromImage } from '@/import/pdf/crop'
import type { ImportSource } from '@/import/source/types'
import { finishRun, recordUsage, startRun as startUsageRun } from '@/lib/aiUsage'
import { setBusy } from '@/lib/busy'
import { recordPageTime, timingKey, typicalPageMs } from '@/lib/importTiming'
import { finishTrace, startTrace, traceAttempt, tracePageEnd, tracePageStart, traceStats, traceWait } from '@/lib/importTrace'

/**
 * The extraction run lives outside React so it keeps going while the user navigates around
 * the app. Components subscribe to its state with useSyncExternalStore.
 */
export interface RunState {
  importId?: string
  phase: 'idle' | 'running' | 'waiting' | 'stopping'
  page?: number
  /** "Page 3", or the file name of a photo. */
  pageLabel?: string
  pageStartedAt?: number
  /** What is happening to the page (see ExtractionStage), and since when. */
  stage?: ExtractionStage
  stageSince?: number
  /** The current try at the model, of `maxAttempts`. */
  attempt?: number
  maxAttempts?: number
  /** Object URL of the image sent to the model; revoked when replaced and when the page ends. */
  preview?: string
  /** Reasoning tokens so far, when the service reports them or they can be estimated. */
  reasoningTokens?: number
  /** Words of the reply so far (hanzi and pinyin of its finished items), and how many items or sentences that is. */
  liveItems?: LiveWord[]
  liveCount?: number
  /** Who reads the pages, for "Sent to …". */
  service?: string
  /** The usual time per page with this service and model, from earlier runs on this device. */
  typicalPageMs?: number
  waitingUntil?: number
  waitReason?: string
  /** Error that stopped the last run (bad key, quota exhausted, …). */
  fatal?: string
}

/** Everything about the page being read, cleared between pages. */
const NO_PAGE: Partial<RunState> = {
  page: undefined,
  pageLabel: undefined,
  pageStartedAt: undefined,
  stage: undefined,
  stageSince: undefined,
  attempt: undefined,
  preview: undefined,
  reasoningTokens: undefined,
  liveItems: undefined,
  liveCount: undefined,
  waitingUntil: undefined,
  waitReason: undefined,
}

let state: RunState = { phase: 'idle' }
let controller: AbortController | undefined
/** The blob behind `state.preview`. */
let previewBlob: Blob | undefined
const listeners = new Set<() => void>()
/** Open sources (PDF or images) by import id; lost on reload (the user re-selects the files to continue). */
const sources = new Map<string, ImportSource>()

function set(next: Partial<RunState>) {
  state = { ...state, ...next }
  listeners.forEach((l) => l())
}

/** An object URL for the page image, made once per image. */
function previewUrl(blob: Blob | undefined): string | undefined {
  if (blob === previewBlob) return state.preview
  if (state.preview) URL.revokeObjectURL(state.preview)
  previewBlob = blob
  return blob ? URL.createObjectURL(blob) : undefined
}

/** Follow the page's steps (streamed text becomes the "words so far"). */
function onStage(e: Extract<ExtractionEvent, { type: 'page-stage' }>, task: JsonTask) {
  const newTry = e.attempt !== state.attempt
  const next: Partial<RunState> = {
    phase: state.phase === 'stopping' ? 'stopping' : 'running',
    stage: e.stage,
    attempt: e.attempt,
    waitingUntil: undefined,
    waitReason: undefined,
  }
  if (e.stage !== state.stage) next.stageSince = Date.now()
  if (e.preview) next.preview = previewUrl(e.preview)
  // A new try starts from nothing.
  if (newTry) Object.assign(next, { reasoningTokens: undefined, liveItems: undefined, liveCount: undefined })
  if (e.reasoningTokens !== undefined) next.reasoningTokens = e.reasoningTokens
  if ((e.stage === 'writing' || e.stage === 'checking') && e.text) {
    const live = liveReply(e.text, task)
    next.liveItems = live.words
    next.liveCount = live.count
  }
  set(next)
}

export const runStore = {
  get: () => state,
  subscribe(listener: () => void) {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
}

export function attachSource(importId: string, source: ImportSource): void {
  sources.get(importId)?.destroy()
  sources.set(importId, source)
}

export function hasSource(importId: string): boolean {
  return sources.has(importId)
}

export function isRunning(importId?: string): boolean {
  return state.phase !== 'idle' && (importId === undefined || state.importId === importId)
}

/** OpenRouter has a request's stats a few seconds after it ends: fetch them in the background for the trace. */
function fetchStatsLater(apiKey: string, id: string, delays = [4_000, 15_000]) {
  const attempt = (i: number) =>
    setTimeout(() => {
      openRouterGenerationStats(apiKey, id).then(
        (stats) => traceStats(id, stats),
        () => i + 1 < delays.length && attempt(i + 1),
      )
    }, delays[i])
  attempt(0)
}

/**
 * Extract all pending pages of an import. Resolves when the run ends (done, stopped or failed).
 * `provider` replaces the configured AI (the import demo); its requests are not counted as usage.
 */
export async function startRun(importId: string, config: ProviderConfig, provider?: VisionProvider): Promise<void> {
  const source = sources.get(importId)
  if (!source) throw new Error('Select the file(s) again to continue.')
  if (state.phase !== 'idle') return
  controller = new AbortController()
  const signal = controller.signal
  // Real runs are traced step by step (Settings → AI usage) and timed for estimates; the demo isn't.
  const traced = !provider
  const timing = timingKey(config)
  set({
    ...NO_PAGE,
    importId,
    phase: 'running',
    fatal: undefined,
    service: provider ? 'the demo AI' : serviceLabel(config),
    typicalPageMs: traced ? typicalPageMs(timing) : undefined,
    maxAttempts: undefined,
  })
  // A sign-in hop (full-page navigation) would stop the run.
  setBusy('import', true)
  const openRouter = config.provider === 'openai-compatible' && config.baseUrl.includes('openrouter.ai')
  let stopped: string | undefined

  try {
    await requeueInterrupted(importId)
    const record = await getImport(importId)
    if (!provider) startUsageRun({ importId, fileName: record?.fileName ?? '', provider: config.provider, model: config.model })
    const [pages, cards, drafts, knownHanzi, isSimplified] = await Promise.all([
      listImportPages(importId),
      listActiveCards(),
      listDrafts(importId),
      knownHanziSet(),
      loadSimplifiedDetector(),
    ])
    const pending = pages.filter((p) => p.status === 'pending').map((p) => p.page)
    const rotation = new Map(pages.map((p) => [p.page, p.rotation ?? 0]))
    const labels = new Map(pages.map((p) => [p.page, p.label ?? `Page ${p.page}`]))
    const task = record?.mode === 'reading' ? READING_TASK : VOCAB_TASK
    if (traced) {
      const where = config.provider === 'openai-compatible' ? config.baseUrl.replace(/^https?:\/\//, '') : config.provider
      startTrace({ fileName: record?.fileName ?? '', mode: record?.mode ?? 'vocabulary', service: `${where} · ${config.model}` })
    }
    await runExtraction(pending, {
      provider: provider ?? withUsageTracking(createProvider(config), config),
      mode: record?.mode,
      render: (page) => source.renderPage(page, rotation.get(page) ?? 0),
      crop: (rendered, box) => cropFromImage(rendered.image, box),
      toBase64: async (blob) => bytesToBase64(new Uint8Array(await blob.arrayBuffer())),
      store: {
        markRunning: (page) => markPageRunning(importId, page),
        markError: (page, message) => markPageError(importId, page, message),
        saveResult: (result) => savePageResult(importId, result),
      },
      context: {
        existingHanzi: new Set(cards.map((c) => c.hanzi)),
        seenInImport: new Set(drafts.map((d) => d.hanzi)),
        knownHanzi,
        isSimplified,
      },
      signal,
      onEvent: (e) => {
        const label = labels.get(e.page) ?? `Page ${e.page}`
        if (e.type === 'page-start') {
          previewUrl(undefined)
          set({ ...NO_PAGE, phase: state.phase === 'stopping' ? 'stopping' : 'running', page: e.page, pageLabel: label, pageStartedAt: Date.now() })
        } else if (e.type === 'page-stage') {
          onStage(e, task)
        } else if (e.type === 'waiting') {
          // The try that failed showed nothing worth keeping.
          set({
            ...(state.phase !== 'stopping' && { phase: 'waiting' as const }),
            waitingUntil: Date.now() + e.ms,
            waitReason: e.reason,
            attempt: e.attempt,
            maxAttempts: e.maxAttempts,
            reasoningTokens: undefined,
            liveItems: undefined,
            liveCount: undefined,
          })
        } else {
          if (e.type === 'page-done' && traced && state.pageStartedAt) {
            recordPageTime(timing, Date.now() - state.pageStartedAt)
            set({ typicalPageMs: typicalPageMs(timing) })
          }
          previewUrl(undefined)
          set({ ...NO_PAGE })
        }
        if (!traced) return
        if (e.type === 'page-start') tracePageStart(e.page, label)
        else if (e.type === 'waiting') traceWait(e.page, e.ms, e.reason)
        else if (e.type === 'page-done') tracePageEnd(e.page, { items: e.items })
        else if (e.type === 'page-error') tracePageEnd(e.page, { error: e.message })
      },
      onAttempt: traced
        ? (e) => {
            traceAttempt(e)
            const id = e.response?.meta?.id
            if (id && openRouter) fetchStatsLater(config.apiKey, id)
          }
        : undefined,
    })
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      stopped = 'Paused'
      await requeueInterrupted(importId)
    } else {
      stopped = e instanceof FatalExtractionError || e instanceof Error ? e.message : String(e)
      set({ fatal: stopped })
    }
  } finally {
    if (traced) finishTrace(stopped)
    if (!provider) finishRun()
    controller = undefined
    setBusy('import', false)
    previewUrl(undefined)
    set({ ...NO_PAGE, phase: 'idle' })
  }
}

/** Count every successful model response (retries are billed too). */
function withUsageTracking(provider: VisionProvider, config: ProviderConfig): VisionProvider {
  return {
    ...provider,
    async extractPage(request) {
      const response = await provider.extractPage(request)
      recordUsage(config.provider, response.model || config.model, response.usage)
      return response
    },
  }
}

export function stopRun(): void {
  if (!controller) return
  set({ phase: 'stopping' })
  controller.abort(new DOMException('Stopped by the user', 'AbortError'))
}
