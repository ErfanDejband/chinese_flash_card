import { useLiveQuery } from 'dexie-react-hooks'
import { loadDeck } from '@/data/repositories/cards'
import { getSettings } from '@/data/repositories/settings'
import type { DeckEntry } from '@/domain/deck'
import type { AppSettings } from '@/domain/types'

/**
 * All active cards with their review state in the practice direction chosen in Settings;
 * re-renders on any change (including switching direction). `undefined` while loading.
 */
export function useDeck(): DeckEntry[] | undefined {
  return useLiveQuery(async () => loadDeck((await getSettings()).reviewMode), [])
}

export function useSettings(): AppSettings | undefined {
  return useLiveQuery(() => getSettings(), [])
}
