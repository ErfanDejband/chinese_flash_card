import { useLiveQuery } from 'dexie-react-hooks'
import { listDecks, listLessons } from '@/data/repositories/decks'
import type { Deck, Id, Lesson } from '@/domain/types'

/** Active decks in list order; `undefined` while loading. */
export function useDecks(): Deck[] | undefined {
  return useLiveQuery(() => listDecks(), [])
}

/** Active lessons in order: of one deck, or of every deck when `deckId` is omitted. */
export function useLessons(deckId?: Id): Lesson[] | undefined {
  return useLiveQuery(() => listLessons(deckId), [deckId])
}
