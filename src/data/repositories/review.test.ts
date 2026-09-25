import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_LEITNER } from '@/domain/leitner/config'
import { ALL_TABLES, db } from '../db'
import { createCard, loadDeck } from './cards'
import { listReviewLog, recordAnswer, undoAnswer } from './review'

beforeEach(async () => {
  await Promise.all(ALL_TABLES().map((t) => t.clear()))
})

const day = (d: number) => new Date(2026, 8, d, 10, 0) // September 2026, local time

describe('review repository', () => {
  it('moves the card and logs the answer', async () => {
    const card = await createCard({ hanzi: '學生', pinyin: 'xuéshēng' })
    await recordAnswer(card.id, 'knew', DEFAULT_LEITNER, day(25))
    await recordAnswer(card.id, 'knew', DEFAULT_LEITNER, day(27))

    const [entry] = await loadDeck()
    expect(entry!.state).toMatchObject({ box: 3, dueOn: '2026-10-01', introducedOn: '2026-09-25', reviewCount: 2 })
    const log = await listReviewLog(card.id)
    expect(log.map((l) => [l.fromBox, l.toBox, l.result])).toEqual([
      [0, 2, 'knew'],
      [2, 3, 'knew'],
    ])
  })

  it('undo restores the previous state and removes the log entry', async () => {
    const card = await createCard({ hanzi: '學生', pinyin: 'xuéshēng' })
    const token = await recordAnswer(card.id, 'forgot', DEFAULT_LEITNER, day(25))
    await undoAnswer(token)
    const [entry] = await loadDeck()
    expect(entry!.state).toMatchObject({ box: 0, dueOn: null, introducedOn: null, reviewCount: 0 })
    expect(await db.reviewLog.count()).toBe(0)
  })
})
