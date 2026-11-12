import { effectiveBox, isDue, newReviewState } from './leitner/scheduler'
import { MY_CARDS } from './library'
import { inScope, type StudyScope } from './scope'
import type { Card, Id, LeitnerConfig, LocalDate, ReviewMode, ReviewState, Timestamp } from './types'
import { symbolInfo, symbolOrder } from './zhuyinSymbols'

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

/**
 * Counts for the cards in `scope` (default: all). The new-card quota is always worked out over
 * all cards: one daily limit, whichever deck is reviewed.
 */
export function summarizeDeck(
  entries: DeckEntry[],
  today: LocalDate,
  config: LeitnerConfig,
  newPerDay: number,
  scope?: StudyScope,
): DeckSummary {
  const all = entries
  if (scope) entries = entries.filter((e) => inScope(e.card, scope))
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
    newToday: Math.min(notStarted, newQuota(all, today, newPerDay)),
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

/**
 * New-card pool in introduction order: the zhuyin symbols in teaching order, then oldest first
 * (imports keep document order via createdAt). With `lessonRanks` (see `lessonRanks` in
 * library.ts), a deck's cards are reordered among the places its cards hold: lesson by lesson,
 * cards with no lesson last. Lesson 1 comes before Lesson 3 even if Lesson 3 was added first,
 * and cards of other decks keep their places.
 */
export function newCardPool(entries: DeckEntry[], lessonRanks?: ReadonlyMap<Id, number>): DeckEntry[] {
  const rank = (e: DeckEntry) => symbolOrder(e.card.hanzi)
  const pool = entries.filter((e) => e.state.box === 0).sort((a, b) => rank(a) - rank(b) || a.card.createdAt - b.card.createdAt)
  if (!lessonRanks?.size) return pool

  const lessonRank = (e: DeckEntry) => (e.card.lessonId === undefined ? Infinity : (lessonRanks.get(e.card.lessonId) ?? Infinity))
  const slots = new Map<Id, number[]>()
  pool.forEach((e, i) => {
    if (e.card.deckId === MY_CARDS || symbolInfo(e.card.hanzi)) return
    slots.set(e.card.deckId, [...(slots.get(e.card.deckId) ?? []), i])
  })
  const ordered = [...pool]
  for (const places of slots.values()) {
    const cards = places.map((i) => pool[i]!).sort((a, b) => lessonRank(a) - lessonRank(b) || a.card.createdAt - b.card.createdAt)
    places.forEach((place, i) => (ordered[place] = cards[i]!))
  }
  return ordered
}
