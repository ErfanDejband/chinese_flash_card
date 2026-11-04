import { beforeEach, describe, expect, it, vi } from 'vitest'
import { _resetReadingPrefCache, getReadingPref, saveReadingPref, subscribeReadingPref } from './readingPref'

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

const KEY = 'mandarin-leitner.reading'

beforeEach(() => {
  store.clear()
  _resetReadingPrefCache()
})

describe('reading preference', () => {
  it('starts with pinyin', () => {
    expect(getReadingPref()).toBe('pinyin')
  })

  it('reads back what was saved, as the plain string', () => {
    saveReadingPref('both')
    expect(store.get(KEY)).toBe('both')
    _resetReadingPrefCache()
    expect(getReadingPref()).toBe('both')
  })

  it('treats a value it does not know as pinyin', () => {
    store.set(KEY, 'wade-giles')
    expect(getReadingPref()).toBe('pinyin')
  })

  it('tells subscribers until they leave', () => {
    const listener = vi.fn()
    const leave = subscribeReadingPref(listener)
    saveReadingPref('zhuyin')
    leave()
    saveReadingPref('pinyin')
    expect(listener).toHaveBeenCalledTimes(1)
  })
})
