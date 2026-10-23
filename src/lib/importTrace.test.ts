import { beforeEach, describe, expect, it } from 'vitest'
import { ModelOutputError } from '@/import/ai/parse'
import { ProviderError } from '@/import/ai/types'
import {
  _resetTraceCache,
  finishTrace,
  formatMs,
  getTrace,
  startTrace,
  summarizeTrace,
  traceAttempt,
  tracePageEnd,
  tracePageStart,
  traceReport,
  traceStats,
  traceWait,
} from './importTrace'

// Minimal localStorage for Node.
const store = new Map<string, string>()
globalThis.localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
  key: () => null,
  length: 0,
} as Storage

beforeEach(() => {
  store.clear()
  _resetTraceCache()
})

/** Two pages: a rate limit, a wait and a slow thinking model; then a reply that isn't JSON. */
function recordRun() {
  startTrace({ fileName: 'IMG_1.jpg + 1 more', mode: 'vocabulary', service: 'openai-compatible · openrouter/free' }, 1_000)
  tracePageStart(1, 'IMG_1.jpg', 1_000)
  traceAttempt({
    page: 1,
    startedAt: 1_000,
    ms: 60_000,
    imageBytes: 400_000,
    error: new ProviderError('rate-limit', 'Rate limit or quota reached: inkling is temporarily rate-limited upstream', { status: 429 }),
  })
  traceWait(1, 10_000, 'rate limit')
  traceAttempt({
    page: 1,
    startedAt: 71_000,
    ms: 120_000,
    imageBytes: 400_000,
    response: {
      text: '{"items":[]}',
      model: 'thinkingmachines/inkling:free',
      usage: { inputTokens: 1800, outputTokens: 3200 },
      meta: { id: 'gen-1', provider: 'Thinking Machines', reasoningTokens: 2500, finishReason: 'stop' },
    },
  })
  tracePageEnd(1, { items: 6 }, 191_000)
  tracePageStart(2, 'IMG_2.jpg', 191_000)
  traceAttempt({ page: 2, startedAt: 191_000, ms: 9_000, imageBytes: 300_000, response: { text: 'oops', model: 'google/gemma-4-31b-it:free' }, error: new ModelOutputError('not JSON') })
  tracePageEnd(2, { error: 'The model did not return JSON.' }, 200_000)
  finishTrace(undefined, 200_000)
}

describe('import trace', () => {
  it('records pages, attempts and waits, and keeps them on the device', () => {
    recordRun()
    _resetTraceCache()
    const trace = getTrace()!
    expect(trace.pages.map((p) => [p.label, p.result, p.steps.map((s) => (s.kind === 'wait' ? 'wait' : s.outcome))])).toEqual([
      ['IMG_1.jpg', 'done', ['error', 'wait', 'ok']],
      ['IMG_2.jpg', 'failed', ['bad-json']],
    ])
    expect(trace.pages[0]!.steps[0]).toMatchObject({ errorKind: 'rate-limit', status: 429, message: expect.stringContaining('rate-limited upstream') })
    expect(trace.pages[0]!.steps[2]).toMatchObject({ model: 'thinkingmachines/inkling:free', provider: 'Thinking Machines', generationId: 'gen-1', reasoningTokens: 2500 })
    expect(trace.pages[1]!.steps[0]).toMatchObject({ outcome: 'bad-json', errorKind: 'bad-json', model: 'google/gemma-4-31b-it:free' })
  })

  it('attaches OpenRouter stats that arrive later', () => {
    recordRun()
    traceStats('gen-1', { latencyMs: 118_000, generationMs: 90_000, completionTokens: 3200, reasoningTokens: 2500 })
    traceStats('gen-unknown', { latencyMs: 1 })
    expect(getTrace()!.pages[0]!.steps[2]).toMatchObject({ stats: { latencyMs: 118_000, generationMs: 90_000 } })
  })

  it('adds a page that is tried again as a new entry', () => {
    startTrace({ fileName: 'f', mode: 'vocabulary', service: 's' }, 0)
    tracePageStart(3, 'Page 3', 0)
    tracePageEnd(3, { error: 'x' }, 5)
    tracePageStart(3, 'Page 3', 10)
    tracePageEnd(3, { items: 2 }, 20)
    expect(getTrace()!.pages.map((p) => p.result)).toEqual(['failed', 'done'])
  })

  it('sums up where the time went', () => {
    recordRun()
    traceStats('gen-1', { latencyMs: 118_000, generationMs: 90_000, completionTokens: 3200, reasoningTokens: 2500 })
    expect(summarizeTrace(getTrace()!)).toEqual({
      pages: 2,
      done: 1,
      failed: 1,
      totalMs: 199_000,
      medianPageMs: 99_500,
      requestMs: 189_000,
      failedRequestMs: 69_000,
      waitMs: 10_000,
      statsRequests: 1,
      generationMs: 90_000,
      firstTokenMs: 118_000,
      outputTokens: 3200,
      reasoningTokens: 2500,
      models: [
        { model: '(no reply)', requests: 1, ok: 0, ms: 60_000 },
        { model: 'thinkingmachines/inkling:free', requests: 1, ok: 1, ms: 120_000 },
        { model: 'google/gemma-4-31b-it:free', requests: 1, ok: 0, ms: 9_000 },
      ],
    })
  })

  it('writes a plain-text report', () => {
    recordRun()
    traceStats('gen-1', { latencyMs: 118_000, generationMs: 90_000, completionTokens: 3200, reasoningTokens: 2500 })
    const report = traceReport(getTrace()!)
    expect(report).toContain('2 pages: 1 done, 1 failed · 3 min 19 s in all · median 1 min 40 s per page')
    expect(report).toContain('OpenRouter (1 requests): waiting for the first token 1 min 58 s · generating 1 min 30 s')
    expect(report).toContain('Tokens out 3.2k, of which reasoning 2.5k (78%)')
    expect(report).toContain('IMG_1.jpg · done, 6 cards · 3 min 10 s · image 391 KB')
    expect(report).toContain('   1. 1 min 00 s · error 429 rate-limit\n     Rate limit or quota reached: inkling is temporarily rate-limited upstream')
    expect(report).toContain('   · waited 10 s (rate limit)')
    expect(report).toContain(
      '   2. 2 min 00 s · ok · thinkingmachines/inkling:free @ Thinking Machines · 1.8k in / 3.2k out (2.5k reasoning) · OpenRouter: first token after 1 min 58 s, generating 1 min 30 s',
    )
    expect(report).toContain('   1. 9 s · bad-json · google/gemma-4-31b-it:free')
  })

  it('formats durations', () => {
    expect([formatMs(400), formatMs(12_400), formatMs(185_000)]).toEqual(['0.4 s', '12 s', '3 min 05 s'])
  })
})
