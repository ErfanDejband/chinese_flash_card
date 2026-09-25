import { useLiveQuery } from 'dexie-react-hooks'
import { loadDeck } from '@/data/repositories/cards'
import { getSettings } from '@/data/repositories/settings'
import type { DeckEntry } from '@/domain/deck'
import type { AppSettings } from '@/domain/types'

/** All active cards with their review state; re-renders on any change. `undefined` while loading. */
export function useDeck(): DeckEntry[] | undefined {
  return useLiveQuery(() => loadDeck(), [])
}

export function useSettings(): AppSettings | undefined {
  return useLiveQuery(() => getSettings(), [])
}
