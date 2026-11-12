import { describe, expect, it } from 'vitest'
import { ALL_CARDS, inScope, parseScope, resolveScope, scopedLink } from './scope'
import { makeCard } from './testing'
import type { Deck, Lesson } from './types'

const deck = (id: string, deletedAt?: number): Deck => ({ id, title: id, order: 0, createdAt: 0, updatedAt: 0, ...(deletedAt ? { deletedAt } : {}) })
const lesson = (id: string, deckId: string, deletedAt?: number): Lesson => ({ id, deckId, title: id, order: 0, createdAt: 0, updatedAt: 0, ...(deletedAt ? { deletedAt } : {}) })

describe('inScope', () => {
  const mine = makeCard()
  const inL1 = makeCard({ deckId: 'class', lessonId: 'l1' })
  const noLesson = makeCard({ deckId: 'class' })

  it('all cards, My cards, a deck, or some of its lessons', () => {
    expect([mine, inL1, noLesson].every((c) => inScope(c, ALL_CARDS))).toBe(true)
    expect(inScope(mine, { kind: 'deck', deckId: 'default' })).toBe(true)
    expect(inScope(inL1, { kind: 'deck', deckId: 'default' })).toBe(false)
    expect(inScope(noLesson, { kind: 'deck', deckId: 'class' })).toBe(true)
    expect(inScope(inL1, { kind: 'deck', deckId: 'class', lessonIds: ['l1'] })).toBe(true)
    expect(inScope(noLesson, { kind: 'deck', deckId: 'class', lessonIds: ['l1'] })).toBe(false)
  })
})

describe('scope links', () => {
  it('round-trip through the query string', () => {
    const scope = { kind: 'deck' as const, deckId: 'class', lessonIds: ['l1', 'l2'] }
    const link = scopedLink('/review', scope, [['new', '5']])
    expect(link).toBe('/review?new=5&deck=class&lessons=l1%2Cl2')
    expect(parseScope(new URLSearchParams(link.split('?')[1]))).toEqual(scope)
    expect(scopedLink('/review', ALL_CARDS)).toBe('/review')
    expect(parseScope(new URLSearchParams('box=2'))).toEqual(ALL_CARDS)
  })
})

describe('resolveScope', () => {
  const decks = [deck('class'), deck('old', 5)]
  const lessons = [lesson('l1', 'class'), lesson('l2', 'class', 5)]

  it('falls back to all cards for a deleted deck, and drops deleted lessons', () => {
    expect(resolveScope({ kind: 'deck', deckId: 'old' }, decks, lessons)).toEqual(ALL_CARDS)
    expect(resolveScope({ kind: 'deck', deckId: 'default' }, decks, lessons)).toEqual({ kind: 'deck', deckId: 'default' })
    expect(resolveScope({ kind: 'deck', deckId: 'class', lessonIds: ['l1', 'l2'] }, decks, lessons)).toEqual({ kind: 'deck', deckId: 'class', lessonIds: ['l1'] })
    expect(resolveScope({ kind: 'deck', deckId: 'class', lessonIds: ['l2'] }, decks, lessons)).toEqual({ kind: 'deck', deckId: 'class' })
  })
})
