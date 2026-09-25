import { describe, expect, it } from 'vitest'
import {
  currentCardId,
  isFinished,
  isFirstAnswer,
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
