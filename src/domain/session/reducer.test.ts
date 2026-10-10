import { describe, expect, it } from 'vitest'
import {
  againProgress,
  attemptNumber,
  currentCardId,
  isFinished,
  isFirstAnswer,
  retriedCards,
  sessionReducer as r,
  sessionStats,
  startSession,
  type SessionState,
} from './reducer'

const answer = (s: SessionState, result: 'knew' | 'forgot', undoToken?: unknown) =>
  r(r(s, { type: 'reveal' }), { type: 'answer', result, undoToken })

describe('session reducer', () => {
  it('walks through the queue', () => {
    let s = startSession(['a', 'b'])
    expect(currentCardId(s)).toBe('a')
    s = answer(s, 'knew')
    expect(currentCardId(s)).toBe('b')
    s = answer(s, 'knew')
    expect(isFinished(s)).toBe(true)
    expect(sessionStats(s)).toEqual({ answered: 2, knew: 2, forgot: 0, learnedNew: 0 })
  })

  it('ignores answers before the card is revealed', () => {
    const s = startSession(['a'])
    expect(r(s, { type: 'answer', result: 'knew' })).toBe(s)
  })

  it('re-queues forgotten cards; only the first answer counts', () => {
    let s = startSession(['a', 'b'], ['b'])
    s = answer(s, 'forgot') // a → end
    expect(s.queue).toEqual(['b', 'a'])
    s = answer(s, 'knew')
    expect(isFirstAnswer(s, 'a')).toBe(false)
    s = answer(s, 'knew') // a again, not first
    expect(isFinished(s)).toBe(true)
    expect(s.firstResults).toEqual({ a: 'forgot', b: 'knew' })
    expect(sessionStats(s)).toEqual({ answered: 2, knew: 1, forgot: 1, learnedNew: 1 })
    expect(s.history.map((h) => h.wasFirst)).toEqual([true, true, false])
  })

  it('a forgotten last card comes straight back', () => {
    let s = answer(startSession(['a']), 'forgot')
    expect(s.queue).toEqual(['a'])
    s = answer(s, 'forgot')
    expect(s.queue).toEqual(['a'])
    s = answer(s, 'knew')
    expect(isFinished(s)).toBe(true)
  })

  it('undo restores the previous card, revealed, and keeps the token for the caller', () => {
    let s = answer(startSession(['a', 'b']), 'forgot', 'token-1')
    expect(s.history.at(-1)?.undoToken).toBe('token-1')
    s = r(s, { type: 'undo' })
    expect(s).toMatchObject({ queue: ['a', 'b'], firstResults: {}, revealed: true, history: [] })
    s = r(s, { type: 'answer', result: 'knew' })
    expect(s.firstResults).toEqual({ a: 'knew' })
  })

  it('undo on an empty history is a no-op', () => {
    const s = startSession(['a'])
    expect(r(s, { type: 'undo' })).toBe(s)
  })

  it('deduplicates the initial queue', () => {
    expect(startSession(['a', 'a', 'b']).total).toBe(2)
  })
})

describe('again progress and tries', () => {
  it('counts forgotten cards and those cleared since', () => {
    let s = startSession(['a', 'b', 'c'])
    expect(againProgress(s)).toEqual({ total: 0, done: 0 })
    s = answer(s, 'forgot') // a
    expect(againProgress(s)).toEqual({ total: 1, done: 0 })
    s = answer(s, 'knew') // b: never part of the again pile
    s = answer(s, 'forgot') // c
    expect(againProgress(s)).toEqual({ total: 2, done: 0 })
    s = answer(s, 'forgot') // a again: still waiting
    expect(againProgress(s)).toEqual({ total: 2, done: 0 })
    s = answer(s, 'knew') // c cleared
    expect(againProgress(s)).toEqual({ total: 2, done: 1 })
    s = answer(s, 'knew') // a cleared
    expect(againProgress(s)).toEqual({ total: 2, done: 2 })
    expect(isFinished(s)).toBe(true)
  })

  it('undo rolls the again progress back', () => {
    let s = answer(answer(startSession(['a']), 'forgot'), 'knew')
    expect(againProgress(s)).toEqual({ total: 1, done: 1 })
    s = r(s, { type: 'undo' })
    expect(againProgress(s)).toEqual({ total: 1, done: 0 })
    s = r(s, { type: 'undo' })
    expect(againProgress(s)).toEqual({ total: 0, done: 0 })
  })

  it('numbers each showing of a card; undo steps back', () => {
    let s = startSession(['a', 'b'])
    expect(attemptNumber(s, 'a')).toBe(1)
    s = answer(s, 'forgot') // a → end
    s = answer(s, 'knew') // b
    expect(currentCardId(s)).toBe('a')
    expect(attemptNumber(s, 'a')).toBe(2)
    s = answer(s, 'forgot')
    expect(attemptNumber(s, 'a')).toBe(3)
    s = r(s, { type: 'undo' })
    expect(attemptNumber(s, 'a')).toBe(2)
  })

  it('lists retried cards, most tries first, including the final Knew', () => {
    let s = startSession(['a', 'b', 'c', 'd'])
    s = answer(s, 'forgot') // a (1)
    s = answer(s, 'forgot') // b (1)
    s = answer(s, 'knew') // c: first try, excluded
    s = answer(s, 'forgot') // d (1)
    s = answer(s, 'knew') // a (2)
    s = answer(s, 'forgot') // b (2)
    s = answer(s, 'knew') // d (2)
    s = answer(s, 'knew') // b (3)
    expect(isFinished(s)).toBe(true)
    expect(retriedCards(s)).toEqual([
      { cardId: 'b', tries: 3 },
      { cardId: 'a', tries: 2 },
      { cardId: 'd', tries: 2 },
    ])
  })

  it('has no retried cards when everything was known', () => {
    expect(retriedCards(answer(startSession(['a']), 'knew'))).toEqual([])
  })
})
