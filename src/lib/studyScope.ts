import { ALL_CARDS, type StudyScope } from '@/domain/scope'

/**
 * What this device reviews from Home and Progress: all cards, or a deck (and some of its
 * lessons). Kept in localStorage (never synced or backed up), like the theme. Check it with
 * `resolveScope` before use: the deck may have been deleted since.
 */
const STORAGE_KEY = 'mandarin-leitner.study-scope'

let cache: StudyScope | undefined
const listeners = new Set<() => void>()

function parse(value: string | null): StudyScope {
  try {
    const v = JSON.parse(value ?? '') as Partial<{ kind: string; deckId: unknown; lessonIds: unknown }>
    if (v.kind === 'deck' && typeof v.deckId === 'string') {
      const lessonIds = Array.isArray(v.lessonIds) ? v.lessonIds.filter((id): id is string => typeof id === 'string') : []
      return lessonIds.length ? { kind: 'deck', deckId: v.deckId, lessonIds } : { kind: 'deck', deckId: v.deckId }
    }
  } catch {
    // Missing or not ours: all cards.
  }
  return ALL_CARDS
}

export function getStudyScope(): StudyScope {
  if (cache === undefined) {
    try {
      cache = parse(localStorage.getItem(STORAGE_KEY))
    } catch {
      cache = ALL_CARDS
    }
  }
  return cache
}

export function saveStudyScope(scope: StudyScope): void {
  cache = scope
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(scope))
  } catch {
    // Storage unavailable: lasts for this session only.
  }
  listeners.forEach((l) => l())
}

export function subscribeStudyScope(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
