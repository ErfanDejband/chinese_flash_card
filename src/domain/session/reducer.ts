import type { Id, ReviewResult } from '../types'

/**
 * Review-session state machine. Pure: persisting answers is the caller's job.
 *
 * - A forgotten card is re-queued at the end so it is practised again in the same session.
 * - Only the first answer per card counts for scheduling; the caller persists it and may attach
 *   an opaque `undoToken` so `undo` can revert the persisted change.
 */
export interface SessionState {
  /** Remaining cards; `queue[0]` is the current one. */
  queue: Id[]
  /** Unique cards in the session. */
  total: number
  newIds: Id[]
  /** First answer per card: this is what moved the card between boxes. */
  firstResults: Record<Id, ReviewResult>
  revealed: boolean
  history: SessionHistoryEntry[]
}

export interface SessionHistoryEntry {
  cardId: Id
  result: ReviewResult
  wasFirst: boolean
  undoToken: unknown
  queue: Id[]
  firstResults: Record<Id, ReviewResult>
}

export type SessionAction =
  | { type: 'reveal' }
  | { type: 'answer'; result: ReviewResult; undoToken?: unknown }
  | { type: 'undo' }

export function startSession(cardIds: Id[], newIds: Id[] = []): SessionState {
  const unique = [...new Set(cardIds)]
  return { queue: unique, total: unique.length, newIds, firstResults: {}, revealed: false, history: [] }
}

export function currentCardId(s: SessionState): Id | undefined {
  return s.queue[0]
}

export function isFirstAnswer(s: SessionState, cardId: Id): boolean {
  return !(cardId in s.firstResults)
}

export function isFinished(s: SessionState): boolean {
  return s.queue.length === 0
}

export function lastHistoryEntry(s: SessionState): SessionHistoryEntry | undefined {
  return s.history[s.history.length - 1]
}

export interface SessionStats {
  answered: number
  knew: number
  forgot: number
  learnedNew: number
}

export function sessionStats(s: SessionState): SessionStats {
  const results = Object.entries(s.firstResults)
  const newSet = new Set(s.newIds)
  return {
    answered: results.length,
    knew: results.filter(([, r]) => r === 'knew').length,
    forgot: results.filter(([, r]) => r === 'forgot').length,
    learnedNew: results.filter(([id]) => newSet.has(id)).length,
  }
}

export function sessionReducer(s: SessionState, action: SessionAction): SessionState {
  switch (action.type) {
    case 'reveal':
      return s.queue.length ? { ...s, revealed: true } : s

    case 'answer': {
      const cardId = s.queue[0]
      if (cardId === undefined || !s.revealed) return s
      const wasFirst = isFirstAnswer(s, cardId)
      const rest = s.queue.slice(1)
      return {
        ...s,
        queue: action.result === 'forgot' ? [...rest, cardId] : rest,
        firstResults: wasFirst ? { ...s.firstResults, [cardId]: action.result } : s.firstResults,
        revealed: false,
        history: [
          ...s.history,
          { cardId, result: action.result, wasFirst, undoToken: action.undoToken, queue: s.queue, firstResults: s.firstResults },
        ],
      }
    }

    case 'undo': {
      const last = lastHistoryEntry(s)
      if (!last) return s
      // The card comes back revealed: the answer was already seen.
      return { ...s, queue: last.queue, firstResults: last.firstResults, revealed: true, history: s.history.slice(0, -1) }
    }
  }
}
