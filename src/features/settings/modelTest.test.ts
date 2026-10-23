import { describe, expect, it } from 'vitest'
import { modelTestReport, type ModelTestState } from './modelTest'

describe('free model test report', () => {
  it('lists each request with its time, score, tokens and OpenRouter timings', () => {
    const state: ModelTestState = {
      running: false,
      startedAt: Date.UTC(2026, 9, 23, 9, 30),
      imageBytes: 180_000,
      rows: [
        {
          label: 'google/gemma-4-31b-it:free',
          status: 'ok',
          ms: 21_000,
          answeredBy: 'google/gemma-4-31b-it:free',
          provider: 'Google AI Studio',
          inputTokens: 1400,
          outputTokens: 650,
          score: { found: 6, pinyinRight: 6, total: 6, other: 0 },
          stats: { latencyMs: 20_000, generationMs: 15_000 },
        },
        { label: 'thinkingmachines/inkling:free', status: 'failed', ms: 180_000, error: 'No answer within 3 min 00 s.' },
        {
          label: 'openrouter/free · try 1',
          status: 'ok',
          ms: 95_000,
          answeredBy: 'thinkingmachines/inkling:free',
          inputTokens: 1500,
          outputTokens: 4100,
          reasoningTokens: 3300,
          jsonFallback: true,
          score: { found: 5, pinyinRight: 4, total: 6, other: 1 },
        },
        { label: 'openrouter/free · try 2', status: 'stopped' },
      ],
    }
    expect(modelTestReport(state).split('\n')).toEqual([
      'Mandarin Leitner · free model test',
      '2026-10-23 09:30 UTC · sample page, 6 words · image 176 KB',
      'google/gemma-4-31b-it:free · ok · 21 s · @ Google AI Studio · 6/6 words, 6/6 pinyin · 1400 in / 650 out · OpenRouter: first token after 20 s, generating 15 s',
      'thinkingmachines/inkling:free · failed · 3 min 00 s',
      '   No answer within 3 min 00 s.',
      'openrouter/free · try 1 · ok · 1 min 35 s · answered by thinkingmachines/inkling:free · 5/6 words, 4/6 pinyin, 1 other · 1500 in / 4100 out (3300 reasoning) · sent twice (JSON mode refused)',
      'openrouter/free · try 2 · stopped',
    ])
  })
})
