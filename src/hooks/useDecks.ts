import { useLiveQuery } from 'dexie-react-hooks'
import { useSyncExternalStore } from 'react'
import { listDecks, listLessons } from '@/data/repositories/decks'
import { resolveScope, type StudyScope } from '@/domain/scope'
import type { Deck, Id, Lesson } from '@/domain/types'
import { getClassNews, subscribeClassNews, type ClassNews } from '@/lib/classRunner'
import { getStudyScope, subscribeStudyScope } from '@/lib/studyScope'

/** Active decks in list order; `undefined` while loading. */
export function useDecks(): Deck[] | undefined {
  return useLiveQuery(() => listDecks(), [])
}

/** Active lessons in order: of one deck, or of every deck when `deckId` is omitted. */
export function useLessons(deckId?: Id): Lesson[] | undefined {
  return useLiveQuery(() => listLessons(deckId), [deckId])
}

/**
 * What Home and Progress review: this device's saved choice, checked against the decks that
 * exist now (a deleted deck means all cards). `undefined` while loading.
 */
export function useStudyScope(): StudyScope | undefined {
  const saved = useSyncExternalStore(subscribeStudyScope, getStudyScope)
  const decks = useDecks()
  const lessons = useLessons()
  return decks && lessons ? resolveScope(saved, decks, lessons) : undefined
}

/** New lessons of joined classes, per deck (device-only; see lib/classRunner). */
export function useClassNews(): Record<Id, ClassNews> {
  return useSyncExternalStore(subscribeClassNews, getClassNews)
}
