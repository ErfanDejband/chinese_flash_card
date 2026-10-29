import type { LearnerLevel } from '@/vision/tasks'

/**
 * Snap's choices on this device (localStorage only; never synced or backed up): how suggestions
 * look, how many to offer, and the learner's level that preselects words.
 */
export interface SnapPrefs {
  view: 'dots' | 'boxes'
  maxSuggest: number
  learner: LearnerLevel
}

const STORAGE_KEY = 'mandarin-leitner.snap'
const DEFAULTS: SnapPrefs = { view: 'dots', maxSuggest: 6, learner: 'beginner' }

let cache: SnapPrefs | undefined
const listeners = new Set<() => void>()

function parse(raw: string | null): SnapPrefs {
  try {
    const v = JSON.parse(raw ?? 'null') as Partial<SnapPrefs> | null
    if (!v || typeof v !== 'object') return DEFAULTS
    return {
      view: v.view === 'boxes' ? 'boxes' : 'dots',
      maxSuggest: typeof v.maxSuggest === 'number' && v.maxSuggest >= 1 && v.maxSuggest <= 16 ? Math.round(v.maxSuggest) : DEFAULTS.maxSuggest,
      learner: v.learner === 'intermediate' || v.learner === 'advanced' ? v.learner : 'beginner',
    }
  } catch {
    return DEFAULTS
  }
}

export function getSnapPrefs(): SnapPrefs {
  if (!cache) {
    try {
      cache = parse(localStorage.getItem(STORAGE_KEY))
    } catch {
      cache = DEFAULTS
    }
  }
  return cache
}

export function setSnapPrefs(patch: Partial<SnapPrefs>): void {
  cache = { ...getSnapPrefs(), ...patch }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cache))
  } catch {
    // Storage unavailable: kept for this session only.
  }
  listeners.forEach((l) => l())
}

export function subscribeSnapPrefs(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
