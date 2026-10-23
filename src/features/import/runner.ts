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
import { createProvider } from '@/import/ai/createProvider'
import { bytesToBase64 } from '@/import/ai/http'
import { openRouterGenerationStats } from '@/import/ai/openrouterAuth'
import type { ProviderConfig, VisionProvider } from '@/import/ai/types'
import { FatalExtractionError, runExtraction } from '@/import/extract/runExtraction'
import { loadSimplifiedDetector } from '@/import/extract/traditional'
import { cropFromImage } from '@/import/pdf/crop'
import type { ImportSource } from '@/import/source/types'
import { finishRun, recordUsage, startRun as startUsageRun } from '@/lib/aiUsage'
import { setBusy } from '@/lib/busy'
import { finishTrace, startTrace, traceAttempt, tracePageEnd, tracePageStart, traceStats, traceWait } from '@/lib/importTrace'

/**
 * The extraction run lives outside React so it keeps going while the user navigates around
 * the app. Components subscribe to its state with useSyncExternalStore.
 */
export interface RunState {
  importId?: string
  phase: 'idle' | 'running' | 'waiting' | 'stopping'
  page?: number
  waitingUntil?: number
  waitReason?: string
  /** Error that stopped the last run (bad key, quota exhausted, …). */
  fatal?: string
}

let state: RunState = { phase: 'idle' }
let controller: AbortController | undefined
const listeners = new Set<() => void>()
/** Open sources (PDF or images) by import id; lost on reload (the user re-selects the files to continue). */
const sources = new Map<string, ImportSource>()

function set(next: Partial<RunState>) {
  state = { ...state, ...next }
  listeners.forEach((l) => l())
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
  set({ importId, phase: 'running', page: undefined, fatal: undefined, waitingUntil: undefined })
  // A sign-in hop (full-page navigation) would stop the run.
  setBusy('import', true)
  // Real runs are traced step by step (Settings → AI usage); the demo isn't.
  const traced = !provider
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
        if (e.type === 'page-start') set({ phase: 'running', page: e.page, waitingUntil: undefined })
        else if (e.type === 'waiting') set({ phase: 'waiting', waitingUntil: Date.now() + e.ms, waitReason: e.reason })
        if (!traced) return
        if (e.type === 'page-start') tracePageStart(e.page, labels.get(e.page) ?? `Page ${e.page}`)
        else if (e.type === 'waiting') traceWait(e.page, e.ms, e.reason)
        else if (e.type === 'page-done') tracePageEnd(e.page, { items: e.items })
        else tracePageEnd(e.page, { error: e.message })
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
    set({ phase: 'idle', page: undefined, waitingUntil: undefined })
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
