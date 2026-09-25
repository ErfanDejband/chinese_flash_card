import { addDays } from '../dates'
import type { Id, LeitnerConfig, LocalDate, ReviewMode, ReviewResult, ReviewState, Timestamp } from '../types'

export function reviewStateId(cardId: Id, mode: ReviewMode): string {
  return `${cardId}:${mode}`
}

/** A card that has not been studied yet: it waits in the new-card pool (box 0). */
export function newReviewState(cardId: Id, mode: ReviewMode, now: Timestamp): ReviewState {
  return {
    id: reviewStateId(cardId, mode),
    cardId,
    mode,
    box: 0,
    dueOn: null,
    introducedOn: null,
    lastReviewedAt: null,
    reviewCount: 0,
    lapseCount: 0,
    updatedAt: now,
  }
}

/** Clamp a stored box into the current config (the box count may have been reduced). */
export function effectiveBox(box: number, config: LeitnerConfig): number {
  return Math.min(Math.max(box, 1), config.boxes.length)
}

export function nextBox(from: number, result: ReviewResult, config: LeitnerConfig): number {
  // A new card (box 0) is answered as if it were in box 1.
  const box = effectiveBox(from, config)
  if (result === 'knew') return Math.min(box + 1, config.boxes.length)
  return config.onFail === 'reset' ? 1 : Math.max(box - 1, 1)
}

export function intervalDays(box: number, config: LeitnerConfig): number {
  return config.boxes[effectiveBox(box, config) - 1]!.intervalDays
}

export function isDue(state: ReviewState, today: LocalDate): boolean {
  return state.box >= 1 && state.dueOn !== null && state.dueOn <= today
}

/**
 * Apply one scheduling answer. Callers are responsible for only passing the *first*
 * answer of a card per day (re-asks inside a session must not move the card).
 */
export function applyReview(
  state: ReviewState,
  result: ReviewResult,
  today: LocalDate,
  now: Timestamp,
  config: LeitnerConfig,
): ReviewState {
  const box = nextBox(state.box, result, config)
  return {
    ...state,
    box,
    dueOn: addDays(today, intervalDays(box, config)),
    introducedOn: state.introducedOn ?? today,
    lastReviewedAt: now,
    reviewCount: state.reviewCount + 1,
    lapseCount: state.lapseCount + (result === 'forgot' && state.box >= 1 ? 1 : 0),
    updatedAt: now,
  }
}
