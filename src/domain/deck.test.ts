import { describe, expect, it } from 'vitest'
import { joinDeck, newCardPool, nextDueDate, summarizeDeck } from './deck'
import { DEFAULT_LEITNER } from './leitner/config'
import { makeCard, makeState } from './testing'

const TODAY = '2026-09-25'

describe('joinDeck', () => {
  it('drops deleted cards and treats cards without state as new', () => {
    const a = makeCard()
    const b = makeCard({ deletedAt: 5 })
    const c = makeCard()
    const entries = joinDeck([a, b, c], [makeState(a.id, 2, TODAY)], 'image_to_word', 0)
    expect(entries.map((e) => e.card.id)).toEqual([a.id, c.id])
    expect(entries[1]!.state.box).toBe(0)
  })
})

describe('summarizeDeck', () => {
  it('counts boxes, due cards and the new-card quota', () => {
    const cards = Array.from({ length: 8 }, () => makeCard())
    const states = [
      makeState(cards[0]!.id, 1, '2026-09-24', { introducedOn: TODAY }), // due, introduced today
      makeState(cards[1]!.id, 1, '2026-09-26'),
      makeState(cards[2]!.id, 3, TODAY), // due
      makeState(cards[3]!.id, 5, '2026-10-01'),
      makeState(cards[4]!.id, 9, TODAY), // box beyond config → counted in box 5, due
      // cards 5..7: no state → new
    ]
    const s = summarizeDeck(joinDeck(cards, states, 'image_to_word', 0), TODAY, DEFAULT_LEITNER, 2)
    expect(s.boxes).toEqual([
      { box: 1, total: 2, due: 1 },
      { box: 2, total: 0, due: 0 },
      { box: 3, total: 1, due: 1 },
      { box: 4, total: 0, due: 0 },
      { box: 5, total: 2, due: 1 },
    ])
    expect(s).toMatchObject({ notStarted: 3, due: 3, introducedToday: 1, newToday: 1, total: 8 })
  })

  it('never offers more new cards than the pool holds', () => {
    const cards = [makeCard()]
    const s = summarizeDeck(joinDeck(cards, [], 'image_to_word', 0), TODAY, DEFAULT_LEITNER, 15)
    expect(s.newToday).toBe(1)
  })
})

describe('nextDueDate', () => {
  it('finds the earliest future due day', () => {
    const cards = [makeCard(), makeCard(), makeCard(), makeCard()]
    const states = [
      makeState(cards[0]!.id, 1, TODAY), // due now: ignored
      makeState(cards[1]!.id, 2, '2026-09-29'),
      makeState(cards[2]!.id, 3, '2026-09-27'),
    ]
    expect(nextDueDate(joinDeck(cards, states, 'image_to_word', 0), TODAY)).toBe('2026-09-27')
    expect(nextDueDate([], TODAY)).toBeUndefined()
  })
})

describe('newCardPool', () => {
  it('orders by creation time', () => {
    const late = makeCard({ createdAt: 300 })
    const early = makeCard({ createdAt: 100 })
    const started = makeCard({ createdAt: 50 })
    const entries = joinDeck([late, early, started], [makeState(started.id, 1, TODAY)], 'image_to_word', 0)
    expect(newCardPool(entries).map((e) => e.card.id)).toEqual([early.id, late.id])
  })
})
