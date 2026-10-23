import { benchmarkCandidates, fetchListedModels, scoreSampleReply, type BenchScore } from '@/import/ai/benchmark'
import { bytesToBase64 } from '@/import/ai/http'
import { createOpenAICompatibleProvider } from '@/import/ai/openaiCompatible'
import { OPENROUTER_BASE_URL, openRouterGenerationStats, type GenerationStats } from '@/import/ai/openrouterAuth'
import { VOCAB_TASK } from '@/import/ai/prompt'
import { defaultSleep } from '@/import/ai/retry'
import { ProviderError } from '@/import/ai/types'
import { createSamplePage, SAMPLE_ITEMS } from '@/import/demo/samplePage'
import { createImageSource } from '@/import/source/imageSource'
import { formatMs } from '@/lib/importTrace'

/**
 * "Test the free models": the sample page goes to each free vision model in turn (see
 * import/ai/benchmark). Lives outside React so it keeps going when the user leaves Settings; the
 * last results stay on the device for "Copy report".
 */
export interface TestRow {
  label: string
  status: 'waiting' | 'running' | 'ok' | 'failed' | 'stopped'
  ms?: number
  /** The model that answered (the router picks one). */
  answeredBy?: string
  provider?: string
  inputTokens?: number
  outputTokens?: number
  reasoningTokens?: number
  jsonFallback?: boolean
  score?: BenchScore
  error?: string
  generationId?: string
  stats?: GenerationStats
}

export interface ModelTestState {
  running: boolean
  startedAt?: number
  imageBytes?: number
  /** What is happening before the rows exist, or why the test could not start. */
  note?: string
  rows: TestRow[]
}

const STORAGE_KEY = 'mandarin-leitner.model-test'
/** A request that takes longer is counted as a failure. */
const TIMEOUT_MS = 180_000
/** Between requests, to stay well under the free tier's 20 requests a minute. */
const GAP_MS = 3_000

function load(): ModelTestState {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as ModelTestState | null
    if (stored && Array.isArray(stored.rows)) {
      // A test cut short by a reload: its unfinished rows didn't finish.
      const rows = stored.rows.map((r) => (r.status === 'running' || r.status === 'waiting' ? { ...r, status: 'stopped' as const } : r))
      return { ...stored, running: false, note: undefined, rows }
    }
  } catch {
    // Unreadable: start empty.
  }
  return { running: false, rows: [] }
}

let state: ModelTestState | undefined
let controller: AbortController | undefined
const listeners = new Set<() => void>()

export const modelTestStore = {
  get: (): ModelTestState => (state ??= load()),
  subscribe(listener: () => void) {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
}

function set(next: Partial<ModelTestState>) {
  state = { ...modelTestStore.get(), ...next }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, running: false }))
  } catch {
    // Storage unavailable: the results last until the app is closed.
  }
  listeners.forEach((l) => l())
}

function setRow(i: number, change: Partial<TestRow>) {
  set({ rows: modelTestStore.get().rows.map((r, j) => (j === i ? { ...r, ...change } : r)) })
}

function statsLater(apiKey: string, id: string, i: number) {
  setTimeout(() => {
    openRouterGenerationStats(apiKey, id).then(
      (stats) => {
        // Only if the row still belongs to this test.
        if (modelTestStore.get().rows[i]?.generationId === id) setRow(i, { stats })
      },
      () => {},
    )
  }, 4_000)
}

export function stopModelTest(): void {
  controller?.abort(new DOMException('Stopped by the user', 'AbortError'))
}

export async function runModelTest(apiKey: string): Promise<void> {
  if (modelTestStore.get().running) return
  controller = new AbortController()
  const signal = controller.signal
  set({ running: true, startedAt: Date.now(), rows: [], imageBytes: undefined, note: 'Getting the list of free models…' })
  try {
    const candidates = benchmarkCandidates(await fetchListedModels(undefined, signal))
    set({ note: 'Drawing the sample page…', rows: candidates.map((c) => ({ label: c.label, status: 'waiting' })) })
    // The same rendering as a real import: a 1536 px JPEG.
    const source = await createImageSource([await createSamplePage()])
    const page = await source.renderPage(1, 0)
    source.destroy()
    const imageBase64 = bytesToBase64(new Uint8Array(await page.aiImage.arrayBuffer()))
    set({ note: undefined, imageBytes: page.aiImage.size })

    for (const [i, c] of candidates.entries()) {
      if (i > 0) await defaultSleep(GAP_MS, signal)
      setRow(i, { status: 'running' })
      const timeout = AbortSignal.timeout(TIMEOUT_MS)
      const provider = createOpenAICompatibleProvider({ baseUrl: OPENROUTER_BASE_URL, apiKey, model: c.model, extraBody: c.extraBody })
      const started = Date.now()
      try {
        const res = await provider.extractPage({
          imageBase64,
          mime: page.aiImage.type || 'image/jpeg',
          textHint: '',
          task: VOCAB_TASK,
          signal: AbortSignal.any([signal, timeout]),
        })
        const row: Partial<TestRow> = {
          ms: Date.now() - started,
          answeredBy: res.model,
          provider: res.meta?.provider,
          inputTokens: res.usage?.inputTokens,
          outputTokens: res.usage?.outputTokens,
          reasoningTokens: res.meta?.reasoningTokens,
          jsonFallback: res.meta?.jsonFallback,
          generationId: res.meta?.id,
        }
        try {
          setRow(i, { ...row, status: 'ok', score: scoreSampleReply(res.text) })
        } catch {
          setRow(i, { ...row, status: 'failed', error: `The reply was not the expected JSON: ${res.text.slice(0, 120)}` })
        }
        if (res.meta?.id) statsLater(apiKey, res.meta.id, i)
      } catch (e) {
        if (signal.aborted) throw e
        const ms = Date.now() - started
        const error = timeout.aborted
          ? `No answer within ${formatMs(TIMEOUT_MS)}.`
          : e instanceof ProviderError
            ? `${e.status ? `${e.status} ` : ''}${e.kind}: ${e.message}`.slice(0, 300)
            : e instanceof Error
              ? e.message
              : String(e)
        setRow(i, { status: 'failed', ms, error })
      }
    }
  } catch (e) {
    if (signal.aborted) {
      set({ rows: modelTestStore.get().rows.map((r) => (r.status === 'running' || r.status === 'waiting' ? { ...r, status: 'stopped' } : r)) })
    } else {
      set({ note: `The test could not run: ${e instanceof Error ? e.message : String(e)}` })
    }
  } finally {
    controller = undefined
    set({ running: false })
  }
}

/** The results as plain text, for pasting into a message. */
export function modelTestReport(s: ModelTestState): string {
  const date = s.startedAt ? new Date(s.startedAt).toISOString().slice(0, 16).replace('T', ' ') : '?'
  const lines = [
    'Mandarin Leitner · free model test',
    `${date} UTC · sample page, ${SAMPLE_ITEMS.length} words${s.imageBytes ? ` · image ${Math.round(s.imageBytes / 1024)} KB` : ''}`,
  ]
  for (const r of s.rows) {
    const parts = [r.label, r.status]
    if (r.ms !== undefined) parts.push(formatMs(r.ms))
    if (r.answeredBy && r.answeredBy !== r.label.split(' · ')[0]) parts.push(`answered by ${r.answeredBy}`)
    if (r.provider) parts.push(`@ ${r.provider}`)
    if (r.score) parts.push(`${r.score.found}/${r.score.total} words, ${r.score.pinyinRight}/${r.score.total} pinyin${r.score.other ? `, ${r.score.other} other` : ''}`)
    if (r.outputTokens !== undefined) {
      const reasoning = r.stats?.reasoningTokens ?? r.reasoningTokens
      parts.push(`${r.inputTokens ?? 0} in / ${r.outputTokens} out${reasoning ? ` (${reasoning} reasoning)` : ''}`)
    }
    if (r.jsonFallback) parts.push('sent twice (JSON mode refused)')
    if (r.stats?.latencyMs !== undefined && r.stats.generationMs !== undefined) {
      parts.push(`OpenRouter: first token after ${formatMs(r.stats.latencyMs)}, generating ${formatMs(r.stats.generationMs)}`)
    }
    lines.push(parts.join(' · '))
    if (r.error) lines.push(`   ${r.error}`)
  }
  if (s.note) lines.push(s.note)
  return lines.join('\n')
}
