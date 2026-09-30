import { beforeEach, describe, expect, it } from 'vitest'
import { _resetUsageCache, finishRun, getUsage, recordUsage, resetUsage, startRun, totalUsage } from './aiUsage'

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
  _resetUsageCache()
  resetUsage(1000)
})

describe('AI usage tracking', () => {
  it('sums per model and in total, counting costs only where known', () => {
    recordUsage('gemini', 'gemini-3.8-flash', { inputTokens: 1000, outputTokens: 200 })
    recordUsage('gemini', 'gemini-3.8-flash', { inputTokens: 1100, outputTokens: 250 })
    recordUsage('anthropic', 'claude-opus-5', { inputTokens: 2000, outputTokens: 500, costUsd: 0.0225, costSource: 'estimated' })
    recordUsage('openai-compatible', 'x/free', undefined) // provider sent no usage

    const state = getUsage()
    expect(state.byModel['gemini · gemini-3.8-flash']).toMatchObject({ requests: 2, inputTokens: 2100, outputTokens: 450, costedRequests: 0 })
    expect(totalUsage(state)).toMatchObject({ requests: 4, inputTokens: 4100, outputTokens: 950, costUsd: 0.0225, costedRequests: 1, estimated: true })
  })

  it('keeps a summary of the last import run', () => {
    recordUsage('gemini', 'm', { inputTokens: 5, outputTokens: 5 }) // before the run: total only
    startRun({ importId: 'imp', fileName: 'book.pdf', provider: 'gemini', model: 'm' }, 2000)
    recordUsage('gemini', 'm', { inputTokens: 100, outputTokens: 10 })
    recordUsage('gemini', 'm', { inputTokens: 120, outputTokens: 12 })
    finishRun(3000)
    recordUsage('gemini', 'm', { inputTokens: 1, outputTokens: 1 }) // after: not part of the run

    expect(getUsage().lastRun).toMatchObject({ fileName: 'book.pdf', requests: 2, inputTokens: 220, outputTokens: 22, startedAt: 2000, finishedAt: 3000 })
    expect(totalUsage(getUsage()).requests).toBe(4)
  })

  it('persists across reloads and resets', () => {
    recordUsage('gemini', 'm', { inputTokens: 10, outputTokens: 1 })
    _resetUsageCache()
    expect(totalUsage(getUsage()).inputTokens).toBe(10)
    resetUsage(5000)
    expect(getUsage()).toEqual({ since: 5000, byModel: {} })
  })
})
