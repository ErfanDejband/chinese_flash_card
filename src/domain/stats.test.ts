import { describe, expect, it } from 'vitest'
import { DEFAULT_LEITNER } from './leitner/config'
import { activityLevel, boxHistory, calendarWeeks, dailyActivity, mostForgotten, periodSummary, streaks } from './stats'
import { makeCard } from './testing'
import type { LeitnerConfig, LocalDate, ReviewLogEntry, ReviewMode, ReviewResult } from './types'

/** Local time on `date` (stats bucket by the local calendar day). */
function at(date: LocalDate, hour = 9, minute = 0): number {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(y!, m! - 1, d!, hour, minute).getTime()
}

let seq = 0
function entry(
  cardId: string,
  date: LocalDate,
  result: ReviewResult,
  fromBox: number,
  toBox: number,
  opts: { mode?: ReviewMode; hour?: number } = {},
): ReviewLogEntry {
  seq++
  // Distinct minutes so entries never share a timestamp.
  return { id: `log-${seq}`, cardId, mode: opts.mode ?? 'image_to_word', at: at(date, opts.hour ?? 9, seq % 60), result, fromBox, toBox }
}

describe('dailyActivity', () => {
  it('buckets by the local day, late evening included', () => {
    const days = dailyActivity([
      entry('a', '2026-10-09', 'knew', 1, 2, { hour: 23 }),
      entry('b', '2026-10-10', 'forgot', 2, 1, { hour: 0 }),
      entry('c', '2026-10-10', 'knew', 0, 2, { mode: 'hanzi_to_meaning' }),
    ])
    expect(days.get('2026-10-09')).toEqual({ reviews: 1, knew: 1, forgot: 0 })
    expect(days.get('2026-10-10')).toEqual({ reviews: 2, knew: 1, forgot: 1 })
  })
})

describe('streaks', () => {
  it('counts back from today', () => {
    expect(streaks(['2026-10-08', '2026-10-09', '2026-10-10'], '2026-10-10')).toEqual({ current: 3, best: 3, reviewedToday: true })
  })

  it('stays alive until midnight when today has no review yet', () => {
    expect(streaks(['2026-10-08', '2026-10-09'], '2026-10-10')).toEqual({ current: 2, best: 2, reviewedToday: false })
  })

  it('breaks after a missed day, keeping the best run', () => {
    const days = ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-10-07', '2026-10-09', '2026-10-10']
    expect(streaks(days, '2026-10-10')).toEqual({ current: 2, best: 4, reviewedToday: true })
    expect(streaks(['2026-10-07'], '2026-10-10')).toEqual({ current: 0, best: 1, reviewedToday: false })
    expect(streaks([], '2026-10-10')).toEqual({ current: 0, best: 0, reviewedToday: false })
  })

  it('runs across a month end', () => {
    expect(streaks(['2026-09-29', '2026-09-30', '2026-10-01'], '2026-10-01').current).toBe(3)
  })
})

describe('periodSummary', () => {
  it('compares the last 7 days with the 7 before', () => {
    const log = [
      entry('a', '2026-10-10', 'knew', 1, 2),
      entry('b', '2026-10-10', 'forgot', 2, 1),
      entry('c', '2026-10-04', 'knew', 0, 2), // 6 days ago: still this period, a new card
      entry('d', '2026-10-03', 'knew', 1, 2), // 7 days ago: previous period
      entry('e', '2026-09-27', 'forgot', 0, 1), // 13 days ago
      entry('f', '2026-09-26', 'knew', 1, 2), // 14 days ago: outside both
    ]
    const { current, previous } = periodSummary(log, '2026-10-10')
    expect(current).toEqual({ reviews: 3, knew: 2, knewPct: 67, newCards: 1, daysStudied: 2 })
    expect(previous).toEqual({ reviews: 2, knew: 1, knewPct: 50, newCards: 1, daysStudied: 2 })
    expect(periodSummary([], '2026-10-10').current.knewPct).toBeNull()
  })
})

describe('boxHistory', () => {
  const today = '2026-10-10'

  it('replays the log into weekly box counts, newest last', () => {
    const a = makeCard()
    const b = makeCard()
    const log = [
      entry(a.id, '2026-09-25', 'knew', 0, 2),
      entry(b.id, '2026-09-30', 'forgot', 0, 1),
      entry(a.id, '2026-10-06', 'knew', 2, 3),
      entry(b.id, '2026-10-09', 'knew', 1, 2),
      entry(a.id, '2026-10-01', 'knew', 0, 4, { mode: 'hanzi_to_meaning' }), // other direction: ignored
    ]
    const history = boxHistory(log, 'image_to_word', [a, b], DEFAULT_LEITNER, today, 3)
    expect(history.map((h) => h.end)).toEqual(['2026-09-26', '2026-10-03', '2026-10-10'])
    expect(history.map((h) => h.counts)).toEqual([
      [0, 1, 0, 0, 0], // a in box 2
      [1, 1, 0, 0, 0], // b started in box 1
      [0, 1, 1, 0, 0], // a → 3, b → 2
    ])
  })

  it('drops deleted cards from their deletion day and clamps to fewer boxes', () => {
    const kept = makeCard()
    const gone = makeCard({ deletedAt: at('2026-10-05') })
    const log = [entry(kept.id, '2026-09-20', 'knew', 4, 5), entry(gone.id, '2026-09-20', 'knew', 0, 2)]
    const three: LeitnerConfig = { ...DEFAULT_LEITNER, boxes: DEFAULT_LEITNER.boxes.slice(0, 3) }
    const history = boxHistory(log, 'image_to_word', [kept, gone], three, today, 2)
    expect(history.map((h) => h.counts)).toEqual([
      [0, 1, 1], // 2026-10-03: box 5 shows as the top box 3
      [0, 0, 1], // 2026-10-10: the deleted card is gone
    ])
  })
})

describe('mostForgotten', () => {
  it('sorts by lapses, then by the most recent one, in one direction', () => {
    const log = [
      entry('a', '2026-10-01', 'forgot', 2, 1),
      entry('b', '2026-10-02', 'forgot', 2, 1),
      entry('a', '2026-10-03', 'knew', 1, 2),
      entry('b', '2026-10-04', 'forgot', 1, 1),
      entry('c', '2026-10-05', 'forgot', 3, 1),
      entry('a', '2026-10-06', 'forgot', 2, 1),
      entry('d', '2026-10-07', 'forgot', 1, 1, { mode: 'hanzi_to_meaning' }),
    ]
    expect(mostForgotten(log, 'image_to_word').map((f) => [f.cardId, f.forgot])).toEqual([
      ['a', 2], // ties with b; forgotten more recently
      ['b', 2],
      ['c', 1],
    ])
    expect(mostForgotten(log, 'hanzi_to_meaning').map((f) => f.cardId)).toEqual(['d'])
  })
})

describe('calendar helpers', () => {
  it('lays out Monday-first weeks ending with this week', () => {
    const weeks = calendarWeeks('2026-10-10', 2) // a Saturday
    expect(weeks[0]).toEqual(['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'])
    expect(weeks[1]).toEqual(['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', null])
  })

  it.each([
    [0, 20, 0],
    [1, 20, 1],
    [5, 20, 1],
    [6, 20, 2],
    [15, 20, 3],
    [20, 20, 4],
    [3, 0, 0],
  ])('activityLevel(%i, max %i) = %i', (reviews, max, level) => {
    expect(activityLevel(reviews, max)).toBe(level)
  })
})
