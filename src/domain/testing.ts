/** Builders shared by domain and data tests. Not imported by app code. */
import { newReviewState } from './leitner/scheduler'
import type { Card, ReviewState } from './types'

let seq = 0

export function makeCard(overrides: Partial<Card> = {}): Card {
  seq++
  return {
    id: `card-${seq}`,
    hanzi: '老師',
    pinyin: 'lǎoshī',
    tags: [],
    deckId: 'default',
    source: { type: 'manual' },
    createdAt: seq,
    updatedAt: seq,
    ...overrides,
  }
}

export function makeState(cardId: string, box: number, dueOn: string | null, overrides: Partial<ReviewState> = {}): ReviewState {
  return { ...newReviewState(cardId, 'image_to_word', 0), box, dueOn, ...overrides }
}
