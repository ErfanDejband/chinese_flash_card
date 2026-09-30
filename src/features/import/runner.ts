import type { PDFDocumentProxy } from 'pdfjs-dist'
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
import { createProvider } from '@/import/ai/createProvider'
import { bytesToBase64 } from '@/import/ai/http'
import type { ProviderConfig, VisionProvider } from '@/import/ai/types'
import { FatalExtractionError, runExtraction } from '@/import/extract/runExtraction'
import { loadSimplifiedDetector } from '@/import/extract/traditional'
import { cropFromImage } from '@/import/pdf/crop'
import { renderPage } from '@/import/pdf/pdf'
import { finishRun, recordUsage, startRun as startUsageRun } from '@/lib/aiUsage'

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
/** Open PDFs by import id; lost on reload (the user re-selects the file to continue). */
const pdfs = new Map<string, PDFDocumentProxy>()

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

export function attachPdf(importId: string, doc: PDFDocumentProxy): void {
  pdfs.set(importId, doc)
}

export function hasPdf(importId: string): boolean {
  return pdfs.has(importId)
}

export function isRunning(importId?: string): boolean {
  return state.phase !== 'idle' && (importId === undefined || state.importId === importId)
}

/** Extract all pending pages of an import. Resolves when the run ends (done, stopped or failed). */
export async function startRun(importId: string, config: ProviderConfig): Promise<void> {
  const doc = pdfs.get(importId)
  if (!doc) throw new Error('Select the PDF again to continue.')
  if (state.phase !== 'idle') return
  controller = new AbortController()
  const signal = controller.signal
  set({ importId, phase: 'running', page: undefined, fatal: undefined, waitingUntil: undefined })

  try {
    await requeueInterrupted(importId)
    const record = await getImport(importId)
    startUsageRun({ importId, fileName: record?.fileName ?? '', provider: config.provider, model: config.model })
    const [pages, cards, drafts, isSimplified] = await Promise.all([
      listImportPages(importId),
      listActiveCards(),
      listDrafts(importId),
      loadSimplifiedDetector(),
    ])
    const pending = pages.filter((p) => p.status === 'pending').map((p) => p.page)
    await runExtraction(pending, {
      provider: withUsageTracking(createProvider(config), config),
      render: (page) => renderPage(doc, page),
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
        isSimplified,
      },
      signal,
      onEvent: (e) => {
        if (e.type === 'page-start') set({ phase: 'running', page: e.page, waitingUntil: undefined })
        else if (e.type === 'waiting') set({ phase: 'waiting', waitingUntil: Date.now() + e.ms, waitReason: e.reason })
      },
    })
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      await requeueInterrupted(importId)
    } else {
      set({ fatal: e instanceof FatalExtractionError || e instanceof Error ? e.message : String(e) })
    }
  } finally {
    finishRun()
    controller = undefined
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
