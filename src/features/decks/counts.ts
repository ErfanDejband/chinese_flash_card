import { summarizeDeck, type DeckEntry } from '@/domain/deck'
import type { AppSettings, Id, LocalDate } from '@/domain/types'

/** How many of a deck's (or its lessons') cards a review would ask today; the new-card limit is shared by all decks. */
export function toStudy(entries: DeckEntry[], deckId: Id, today: LocalDate, settings: AppSettings, lessonIds?: Id[]): number {
  const s = summarizeDeck(entries, today, settings.leitner, settings.newPerDay, { kind: 'deck', deckId, ...(lessonIds ? { lessonIds } : {}) })
  return s.due + s.newToday
}
