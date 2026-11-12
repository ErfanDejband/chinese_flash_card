import { describe, expect, it } from 'vitest'
import { joinDeck } from '../deck'
import { DEFAULT_LEITNER } from '../leitner/config'
import { makeCard, makeState } from '../testing'
import { planSession } from './plan'

const TODAY = '2026-09-25'

function fixture() {
  const c = Array.from({ length: 8 }, (_, i) => makeCard({ createdAt: 100 + i }))
  const states = [
    makeState(c[0]!.id, 3, TODAY),
    makeState(c[1]!.id, 1, '2026-09-20'),
    makeState(c[2]!.id, 2, '2026-10-01'), // not due
    makeState(c[3]!.id, 1, TODAY),
    makeState(c[4]!.id, 1, TODAY, { introducedOn: TODAY }), // new card already introduced today
    // c5, c6, c7: new
  ]
  return { c, entries: joinDeck(c, states, 'image_to_word', 0) }
}

const opts = { today: TODAY, config: DEFAULT_LEITNER, newPerDay: 3, random: () => 0 }

describe('planSession', () => {
  it('daily: due cards from the lowest box up, then new cards within the remaining quota', () => {
    const { c, entries } = fixture()
    const plan = planSession(entries, { kind: 'daily' }, opts)
    const ids = plan.cardIds
    // box 1 due cards first (any order), then box 3
    expect(new Set(ids.slice(0, 3))).toEqual(new Set([c[1]!.id, c[3]!.id, c[4]!.id]))
    expect(ids[3]).toBe(c[0]!.id)
    // quota 3 - 1 introduced today = 2 new cards, oldest first
    expect(plan.newIds).toEqual([c[5]!.id, c[6]!.id])
    expect(ids.slice(4)).toEqual(plan.newIds)
    expect(ids).not.toContain(c[2]!.id)
  })

  it('box: only due cards from that box, no new cards', () => {
    const { c, entries } = fixture()
    const plan = planSession(entries, { kind: 'box', box: 3 }, opts)
    expect(plan).toEqual({ cardIds: [c[0]!.id], newIds: [] })
  })

  it('new: only new cards, ignoring the daily quota', () => {
    const { c, entries } = fixture()
    const plan = planSession(entries, { kind: 'new', count: 10 }, opts)
    expect(plan.cardIds).toEqual([c[5]!.id, c[6]!.id, c[7]!.id])
  })

  it('shuffles within a box using the injected random source', () => {
    const cards = Array.from({ length: 5 }, () => makeCard())
    const entries = joinDeck(cards, cards.map((x) => makeState(x.id, 1, TODAY)), 'image_to_word', 0)
    const a = planSession(entries, { kind: 'daily' }, { ...opts, random: () => 0 }).cardIds
    const b = planSession(entries, { kind: 'daily' }, { ...opts, random: () => 0.99 }).cardIds
    expect(new Set(a)).toEqual(new Set(b))
    expect(a).not.toEqual(b)
  })
})

describe('planSession with a scope', () => {
  it('reviews only the deck, but the new-card limit counts every card', () => {
    const mine = makeCard({ createdAt: 1 })
    const introduced = makeCard({ createdAt: 2 })
    const deckCards = Array.from({ length: 4 }, (_, i) => makeCard({ createdAt: 10 + i, deckId: 'class' }))
    const due = makeCard({ createdAt: 20, deckId: 'class' })
    const states = [makeState(mine.id, 1, TODAY), makeState(introduced.id, 1, '2026-09-30', { introducedOn: TODAY }), makeState(due.id, 2, TODAY)]
    const entries = joinDeck([mine, introduced, ...deckCards, due], states, 'image_to_word', 0)

    const plan = planSession(entries, { kind: 'daily' }, { ...opts, scope: { kind: 'deck', deckId: 'class' } })
    expect(plan.cardIds[0]).toBe(due.id)
    // quota 3 - 1 introduced today (outside the deck) = 2
    expect(plan.newIds).toEqual([deckCards[0]!.id, deckCards[1]!.id])
    expect(plan.cardIds).not.toContain(mine.id)
  })

  it('introduces a deck lesson by lesson, keeping other cards in their places', () => {
    const l3a = makeCard({ createdAt: 1, deckId: 'class', lessonId: 'l3' })
    const mine = makeCard({ createdAt: 2 })
    const l1a = makeCard({ createdAt: 3, deckId: 'class', lessonId: 'l1' })
    const loose = makeCard({ createdAt: 4, deckId: 'class' })
    const l1b = makeCard({ createdAt: 5, deckId: 'class', lessonId: 'l1' })
    const entries = joinDeck([l3a, mine, l1a, loose, l1b], [], 'image_to_word', 0)
    const ranks = new Map([
      ['l1', 0],
      ['l3', 1],
    ])
    const plan = planSession(entries, { kind: 'new', count: 10 }, { ...opts, lessonRanks: ranks })
    expect(plan.newIds).toEqual([l1a.id, mine.id, l1b.id, l3a.id, loose.id])
  })
})
