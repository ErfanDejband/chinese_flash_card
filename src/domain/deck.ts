import { effectiveBox, isDue, newReviewState } from './leitner/scheduler'
import type { Card, LeitnerConfig, LocalDate, ReviewMode, ReviewState, Timestamp } from './types'

export interface DeckEntry {
  card: Card
  state: ReviewState
}

/**
 * Join the active (non-deleted) cards with their state in `mode`. A card without a state
 * (e.g. after a new review mode is introduced) is treated as not started.
 */
export function joinDeck(cards: Card[], states: ReviewState[], mode: ReviewMode, now: Timestamp): DeckEntry[] {
  const byCard = new Map<string, ReviewState>()
  for (const s of states) if (s.mode === mode) byCard.set(s.cardId, s)
  return cards
    .filter((c) => c.deletedAt === undefined)
    .map((card) => ({ card, state: byCard.get(card.id) ?? newReviewState(card.id, mode, now) }))
}

export interface BoxSummary {
  box: number
  total: number
  due: number
}

export interface DeckSummary {
  /** Boxes 1..N. */
  boxes: BoxSummary[]
  /** Cards in the new-card pool. */
  notStarted: number
  /** Cards due today (already started ones). */
  due: number
  /** New cards that left the pool today. */
  introducedToday: number
  /** New cards a daily session would still introduce today. */
  newToday: number
  total: number
}

export function introducedOn(entries: DeckEntry[], today: LocalDate): number {
  return entries.filter((e) => e.state.introducedOn === today).length
}

/** How many new cards may still be introduced today. */
export function newQuota(entries: DeckEntry[], today: LocalDate, newPerDay: number): number {
  return Math.max(0, newPerDay - introducedOn(entries, today))
}

export function summarizeDeck(
  entries: DeckEntry[],
  today: LocalDate,
  config: LeitnerConfig,
  newPerDay: number,
): DeckSummary {
  const boxes: BoxSummary[] = config.boxes.map((_, i) => ({ box: i + 1, total: 0, due: 0 }))
  let notStarted = 0
  let due = 0
  for (const { state } of entries) {
    if (state.box === 0) {
      notStarted++
      continue
    }
    const b = boxes[effectiveBox(state.box, config) - 1]!
    b.total++
    if (isDue(state, today)) {
      b.due++
      due++
    }
  }
  return {
    boxes,
    notStarted,
    due,
    introducedToday: introducedOn(entries, today),
    newToday: Math.min(notStarted, newQuota(entries, today, newPerDay)),
    total: entries.length,
  }
}

/** Earliest due day after `today`, if any card is scheduled. */
export function nextDueDate(entries: DeckEntry[], today: LocalDate): LocalDate | undefined {
  let next: LocalDate | undefined
  for (const { state } of entries) {
    if (state.box >= 1 && state.dueOn && state.dueOn > today && (!next || state.dueOn < next)) next = state.dueOn
  }
  return next
}

/** New-card pool in introduction order: oldest first (imports keep document order via createdAt). */
export function newCardPool(entries: DeckEntry[]): DeckEntry[] {
  return entries.filter((e) => e.state.box === 0).sort((a, b) => a.card.createdAt - b.card.createdAt)
}
