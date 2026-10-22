import { describe, expect, it } from 'vitest'
import { DEFAULT_LEITNER } from './config'
import { demoStep, demoTimeline } from './demo'

describe('demoStep', () => {
  it('moves a known card up one box and says when it comes back', () => {
    expect(demoStep(2, 'knew', DEFAULT_LEITNER)).toEqual({ box: 3, inDays: 4 })
  })

  it('answers a new card as if it were in box 1', () => {
    expect(demoStep(0, 'knew', DEFAULT_LEITNER)).toEqual({ box: 2, inDays: 2 })
  })

  it('keeps a known card in the top box', () => {
    expect(demoStep(5, 'knew', DEFAULT_LEITNER)).toEqual({ box: 5, inDays: 14 })
  })

  it('sends a forgotten card back to box 1, or one box down with "demote"', () => {
    expect(demoStep(4, 'forgot', DEFAULT_LEITNER)).toEqual({ box: 1, inDays: 1 })
    expect(demoStep(4, 'forgot', { ...DEFAULT_LEITNER, onFail: 'demote' })).toEqual({ box: 3, inDays: 4 })
  })
})

describe('demoTimeline', () => {
  it('reviews on days 0, 2, 6, 13 and 27 with the default boxes', () => {
    const timeline = demoTimeline(DEFAULT_LEITNER, 30)
    expect(timeline).toHaveLength(31)
    expect(timeline.filter((d) => d.reviewed).map((d) => [d.day, d.box])).toEqual([
      [0, 2],
      [2, 3],
      [6, 4],
      [13, 5],
      [27, 5],
    ])
  })

  it('rests in its box between reviews', () => {
    expect(demoTimeline(DEFAULT_LEITNER, 30)[4]).toEqual({ day: 4, box: 3, reviewed: false, nextDay: 6 })
  })

  it('follows custom intervals', () => {
    const config = { boxes: [1, 1, 3].map((intervalDays) => ({ intervalDays })), onFail: 'reset' as const }
    expect(demoTimeline(config, 6).filter((d) => d.reviewed).map((d) => d.day)).toEqual([0, 1, 4])
  })
})
