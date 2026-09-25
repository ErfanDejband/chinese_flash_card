import { describe, expect, it } from 'vitest'
import type { LeitnerConfig, ReviewResult, ReviewState } from '../types'
import { DEFAULT_LEITNER } from './config'
import { applyReview, isDue, nextBox, newReviewState } from './scheduler'

const TODAY = '2026-09-25'
const NOW = 1_000

const demote: LeitnerConfig = { ...DEFAULT_LEITNER, onFail: 'demote' }

function stateIn(box: number, extra: Partial<ReviewState> = {}): ReviewState {
  return { ...newReviewState('c1', 'image_to_word', 0), box, dueOn: box ? TODAY : null, ...extra }
}

describe('nextBox', () => {
  it.each<[number, ReviewResult, LeitnerConfig, number]>([
    // new card is answered as box 1
    [0, 'knew', DEFAULT_LEITNER, 2],
    [0, 'forgot', DEFAULT_LEITNER, 1],
    // knew moves up, capped at the last box
    [1, 'knew', DEFAULT_LEITNER, 2],
    [4, 'knew', DEFAULT_LEITNER, 5],
    [5, 'knew', DEFAULT_LEITNER, 5],
    // reset policy: forgot always goes to box 1
    [1, 'forgot', DEFAULT_LEITNER, 1],
    [3, 'forgot', DEFAULT_LEITNER, 1],
    [5, 'forgot', DEFAULT_LEITNER, 1],
    // demote policy: forgot drops one box, never below 1
    [5, 'forgot', demote, 4],
    [2, 'forgot', demote, 1],
    [1, 'forgot', demote, 1],
    // stored box beyond a shrunk config is clamped first
    [7, 'knew', DEFAULT_LEITNER, 5],
    [7, 'forgot', demote, 4],
  ])('from box %i, %s (%o) → box %i', (from, result, config, expected) => {
    expect(nextBox(from, result, config)).toBe(expected)
  })
})

describe('applyReview', () => {
  it('schedules by the interval of the destination box', () => {
    // default intervals: 1, 2, 4, 7, 14
    expect(applyReview(stateIn(1), 'knew', TODAY, NOW, DEFAULT_LEITNER).dueOn).toBe('2026-09-27') // box 2
    expect(applyReview(stateIn(4), 'knew', TODAY, NOW, DEFAULT_LEITNER).dueOn).toBe('2026-10-09') // box 5
    expect(applyReview(stateIn(5), 'knew', TODAY, NOW, DEFAULT_LEITNER).dueOn).toBe('2026-10-09') // stays 5
    expect(applyReview(stateIn(3), 'forgot', TODAY, NOW, DEFAULT_LEITNER).dueOn).toBe('2026-09-26') // box 1
  })

  it('introduces a new card on its first answer', () => {
    const next = applyReview(stateIn(0), 'knew', TODAY, NOW, DEFAULT_LEITNER)
    expect(next).toMatchObject({ box: 2, introducedOn: TODAY, reviewCount: 1, lapseCount: 0, lastReviewedAt: NOW })
  })

  it('keeps the original introduction day', () => {
    const next = applyReview(stateIn(2, { introducedOn: '2026-09-01' }), 'knew', TODAY, NOW, DEFAULT_LEITNER)
    expect(next.introducedOn).toBe('2026-09-01')
  })

  it('counts lapses only for started cards', () => {
    expect(applyReview(stateIn(0), 'forgot', TODAY, NOW, DEFAULT_LEITNER).lapseCount).toBe(0)
    expect(applyReview(stateIn(3), 'forgot', TODAY, NOW, DEFAULT_LEITNER).lapseCount).toBe(1)
  })

  it('does not mutate its input', () => {
    const s = stateIn(2)
    const copy = structuredClone(s)
    applyReview(s, 'knew', TODAY, NOW, DEFAULT_LEITNER)
    expect(s).toEqual(copy)
  })

  it('respects custom intervals', () => {
    const config: LeitnerConfig = { boxes: [{ intervalDays: 1 }, { intervalDays: 3 }, { intervalDays: 30 }], onFail: 'reset' }
    const next = applyReview(stateIn(2), 'knew', TODAY, NOW, config)
    expect(next).toMatchObject({ box: 3, dueOn: '2026-10-25' })
  })
})

describe('isDue', () => {
  it.each([
    [stateIn(0), false],
    [stateIn(1, { dueOn: '2026-09-24' }), true],
    [stateIn(1, { dueOn: TODAY }), true],
    [stateIn(3, { dueOn: '2026-09-26' }), false],
  ])('%o → %s', (state, expected) => {
    expect(isDue(state, TODAY)).toBe(expected)
  })
})
