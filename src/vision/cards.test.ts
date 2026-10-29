import { describe, expect, it } from 'vitest'
import { plannedCards, preselect, preselectAll, snapTags, type SnapContext } from './cards'
import type { ObjectWords, WordChoice } from './tasks'

const w = (hanzi: string, kind: WordChoice['kind'], level: WordChoice['level'] = 'A1'): WordChoice => ({ hanzi, pinyin: '', meaning: hanzi, kind, level })
const shoes: ObjectWords = { words: [w('鞋子', 'everyday'), w('球鞋', 'specific', 'A2')], category: { hanzi: '衣物', pinyin: 'yīwù', meaning: 'clothing' }, confidence: 0.9 }
const remote: ObjectWords = { words: [w('遙控器', 'everyday', 'B1')], category: { hanzi: '電器', pinyin: 'diànqì', meaning: 'appliances' }, confidence: 0.9 }
const empty: SnapContext = { inDeck: new Set(), known: new Set() }

describe('preselect', () => {
  it('takes the learner’s default when it is free', () => {
    expect(preselect(shoes.words, 'beginner', empty)).toEqual([0])
    expect(preselect(shoes.words, 'intermediate', empty)).toEqual([1])
  })

  it('moves to a free word when the default is already a card or known, and to none when all are', () => {
    expect(preselect(shoes.words, 'beginner', { inDeck: new Set(['鞋子']), known: new Set() })).toEqual([1])
    expect(preselect(shoes.words, 'beginner', { inDeck: new Set(['鞋子']), known: new Set(['球鞋']) })).toEqual([])
    expect(preselect([], 'beginner', empty)).toEqual([])
  })

  it('preselects every named object', () => {
    expect(preselectAll(new Map([[1, shoes], [3, remote]]), 'beginner', empty)).toEqual({ 1: [0], 3: [0] })
  })
})

describe('plannedCards', () => {
  it('makes one card per kept free word, in picture order, tagged with the category', () => {
    const names = new Map([[2, shoes], [1, remote], [3, remote]])
    const plan = plannedCards(names, { 1: [0], 2: [0, 1], 3: [0] }, 3, { inDeck: new Set(['球鞋']), known: new Set() })
    expect(plan.map((p) => [p.index, p.word.hanzi, p.tags])).toEqual([
      [1, '遙控器', ['snap', '電器']],
      [2, '鞋子', ['snap', '衣物']],
    ])
  })

  it('tags with snap alone when there is no category', () => {
    expect(snapTags()).toEqual(['snap'])
    expect(snapTags({ hanzi: '衣物' })).toEqual(['snap', '衣物'])
  })
})
