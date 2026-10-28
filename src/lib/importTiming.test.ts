import { beforeEach, describe, expect, it } from 'vitest'
import { estimateRemainingMs, formatAbout, recordPageTime, timingKey, typicalPageMs } from './importTiming'

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

beforeEach(() => store.clear())

describe('import timing', () => {
  it('keys by service and configured model', () => {
    expect(timingKey({ provider: 'openai-compatible', baseUrl: 'https://openrouter.ai/api/v1', apiKey: 'k', model: 'openrouter/free' })).toBe(
      'openrouter.ai·openrouter/free',
    )
    expect(timingKey({ provider: 'gemini', baseUrl: '', apiKey: 'k', model: 'gemini-3.8-flash' })).toBe('gemini·gemini-3.8-flash')
    expect(timingKey({ provider: 'openai-compatible', baseUrl: 'http://127.0.0.1:8799/v1', apiKey: '', model: 'mock-vision' })).toBe('127.0.0.1:8799·mock-vision')
  })

  it('knows the typical page time once two pages are recorded: the median', () => {
    expect(typicalPageMs('m')).toBeUndefined()
    recordPageTime('m', 40_000)
    expect(typicalPageMs('m')).toBeUndefined()
    recordPageTime('m', 60_000)
    expect(typicalPageMs('m')).toBe(50_000)
    recordPageTime('m', 200_000)
    expect(typicalPageMs('m')).toBe(60_000)
    expect(typicalPageMs('other')).toBeUndefined()
  })

  it('keeps the last 20 pages per model, ignoring impossible durations', () => {
    for (let i = 1; i <= 25; i++) recordPageTime('m', i * 1000)
    recordPageTime('m', 0)
    recordPageTime('m', Number.NaN)
    const stored = JSON.parse(store.get('mandarin-leitner.import-timing')!) as Record<string, number[]>
    expect(stored.m).toEqual(Array.from({ length: 20 }, (_, i) => (i + 6) * 1000))
    expect(typicalPageMs('m')).toBe(15_500)
  })

  it('forgets the least recently used models beyond 20', () => {
    for (let i = 0; i < 22; i++) recordPageTime(`model ${i}`, 1000)
    recordPageTime('model 2', 1000)
    recordPageTime('model 22', 1000)
    const keys = Object.keys(JSON.parse(store.get('mandarin-leitner.import-timing')!) as object)
    expect(keys).toHaveLength(20)
    expect(keys).not.toContain('model 0')
    expect(keys).toContain('model 2')
    expect(keys.at(-1)).toBe('model 22')
  })

  it('survives broken or missing storage', () => {
    store.set('mandarin-leitner.import-timing', '{not json')
    expect(typicalPageMs('m')).toBeUndefined()
    recordPageTime('m', 1000)
    recordPageTime('m', 3000)
    expect(typicalPageMs('m')).toBe(2000)
  })

  it('estimates the time left: what the current page still needs, never below zero, plus the pages waiting', () => {
    expect(estimateRemainingMs(45_000, 3, 15_000)).toBe(30_000 + 3 * 45_000)
    expect(estimateRemainingMs(45_000, 3, 90_000)).toBe(3 * 45_000)
    expect(estimateRemainingMs(45_000, 0, 90_000)).toBe(0)
    expect(estimateRemainingMs(45_000, 2)).toBe(90_000)
  })

  it('rounds to friendly amounts', () => {
    expect(formatAbout(1_000)).toBe('about 5 s')
    expect(formatAbout(42_000)).toBe('about 40 s')
    expect(formatAbout(58_000)).toBe('about 1 min')
    expect(formatAbout(185_000)).toBe('about 3 min')
  })
})
