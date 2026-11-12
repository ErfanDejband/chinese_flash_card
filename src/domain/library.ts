import type { Card, Deck, Id, Lesson } from './types'

/**
 * Decks and lessons: how cards are grouped. Every card has a `deckId`; cards in no deck use
 * {@link MY_CARDS} ("My cards"). A card in a deck may also have a `lessonId`.
 */
export const MY_CARDS = 'default'

type Ordered = { id: Id; order: number; createdAt: number }

/** Deck list and lesson order: by `order`, then oldest first. */
export function byOrder(a: Ordered, b: Ordered): number {
  return a.order - b.order || a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
}

/** "Lesson 3" and " lesson  3 " are the same lesson when a word list names it again. */
export const titleKey = (title: string) => title.trim().replace(/\s+/g, ' ').toLowerCase()

export const isActive = (row: { deletedAt?: number }) => row.deletedAt === undefined

/** Rank of each active lesson across all decks (deck order, then lesson order), for introducing new cards. */
export function lessonRanks(decks: readonly Deck[], lessons: readonly Lesson[]): Map<Id, number> {
  const deckRank = new Map([...decks].filter(isActive).sort(byOrder).map((d, i) => [d.id, i]))
  const sorted = lessons
    .filter((l) => isActive(l) && deckRank.has(l.deckId))
    .sort((a, b) => deckRank.get(a.deckId)! - deckRank.get(b.deckId)! || byOrder(a, b))
  return new Map(sorted.map((l, i) => [l.id, i]))
}

export const inMyCards = (card: Pick<Card, 'deckId'>) => card.deckId === MY_CARDS

/** The next `order` after the given rows. */
export const nextOrder = (rows: readonly { order: number }[]) => rows.reduce((max, r) => Math.max(max, r.order + 1), 0)
