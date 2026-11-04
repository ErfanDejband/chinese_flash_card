/**
 * How this device writes a word's reading: pinyin, zhuyin or both. Kept in localStorage as the
 * plain string (never synced or backed up), like the theme.
 */
export type ReadingPref = 'pinyin' | 'zhuyin' | 'both'

export const READING_PREFS: readonly ReadingPref[] = ['pinyin', 'zhuyin', 'both']

const STORAGE_KEY = 'mandarin-leitner.reading'

let cache: ReadingPref | undefined
const listeners = new Set<() => void>()

function isReadingPref(value: unknown): value is ReadingPref {
  return value === 'pinyin' || value === 'zhuyin' || value === 'both'
}

export function getReadingPref(): ReadingPref {
  if (cache === undefined) {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      cache = isReadingPref(stored) ? stored : 'pinyin'
    } catch {
      cache = 'pinyin'
    }
  }
  return cache
}

export function saveReadingPref(pref: ReadingPref): void {
  cache = pref
  try {
    localStorage.setItem(STORAGE_KEY, pref)
  } catch {
    // Storage unavailable: lasts for this session only.
  }
  listeners.forEach((l) => l())
}

export function subscribeReadingPref(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Forget the cached preference (tests). */
export function _resetReadingPrefCache(): void {
  cache = undefined
}
