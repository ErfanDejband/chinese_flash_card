import { describe, expect, it } from 'vitest'
import { matchesQuery } from './search'
import { makeCard } from './testing'

const card = makeCard({ hanzi: '老師', pinyin: 'lǎoshī', meaning: 'Teacher', notes: 'Formal', tags: ['lesson-1'] })

describe('matchesQuery', () => {
  it.each([
    ['', true],
    ['師', true],
    ['laoshi', true],
    ['lao3', true],
    ['lǎo shī', true],
    ['teach', true],
    ['formal', true],
    ['lesson', true],
    ['student', false],
    ['學', false],
  ])('%s → %s', (q, expected) => {
    expect(matchesQuery(card, q)).toBe(expected)
  })
})
