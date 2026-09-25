import { toLocalDate } from '@/domain/dates'
import { newId } from '@/domain/ids'
import { applyReview, newReviewState, reviewStateId } from '@/domain/leitner/scheduler'
import type { Id, LeitnerConfig, ReviewLogEntry, ReviewMode, ReviewResult, ReviewState } from '@/domain/types'
import { db } from '../db'
import { DEFAULT_MODE } from './cards'

/** What `undoAnswer` needs to revert a persisted answer. */
export interface AnswerUndoToken {
  prevState: ReviewState
  logId: Id
}

/** Persist a scheduling answer: new review state + log entry, atomically. */
export async function recordAnswer(
  cardId: Id,
  result: ReviewResult,
  config: LeitnerConfig,
  now = new Date(),
  mode: ReviewMode = DEFAULT_MODE,
): Promise<AnswerUndoToken> {
  const at = now.getTime()
  return db.transaction('rw', db.reviewStates, db.reviewLog, async () => {
    const prevState = (await db.reviewStates.get(reviewStateId(cardId, mode))) ?? newReviewState(cardId, mode, at)
    const next = applyReview(prevState, result, toLocalDate(now), at, config)
    const log: ReviewLogEntry = { id: newId(), cardId, mode, at, result, fromBox: prevState.box, toBox: next.box }
    await db.reviewStates.put(next)
    await db.reviewLog.add(log)
    return { prevState, logId: log.id }
  })
}

export async function undoAnswer(token: AnswerUndoToken, now = Date.now()): Promise<void> {
  await db.transaction('rw', db.reviewStates, db.reviewLog, async () => {
    // A fresh updatedAt so the reverted state wins a later last-write-wins merge.
    await db.reviewStates.put({ ...token.prevState, updatedAt: now })
    await db.reviewLog.delete(token.logId)
  })
}

export function getReviewState(cardId: Id, mode: ReviewMode = DEFAULT_MODE): Promise<ReviewState | undefined> {
  return db.reviewStates.get(reviewStateId(cardId, mode))
}

export function listReviewLog(cardId: Id): Promise<ReviewLogEntry[]> {
  return db.reviewLog.where('cardId').equals(cardId).sortBy('at')
}
