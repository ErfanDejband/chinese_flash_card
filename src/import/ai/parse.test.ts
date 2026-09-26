import { describe, expect, it } from 'vitest'
import { BOOK2_P5_REPLY, BOOK3_P20_REPLY } from './fixtures'
import { ModelOutputError, parseBox, parseModelJson, validateItems } from './parse'

describe('parseModelJson', () => {
  it('reads plain JSON and fenced JSON', () => {
    expect(validateItems(parseModelJson(BOOK2_P5_REPLY)).items).toHaveLength(4)
    expect(validateItems(parseModelJson(BOOK3_P20_REPLY)).items[0]!.hanzi).toBe('老師')
  })

  it('ignores prose around the object', () => {
    expect(parseModelJson('Sure! Here it is: {"items": []} Hope this helps.')).toEqual({ items: [] })
  })

  it.each(['no json here', '{"items": [}'])('rejects %s', (text) => {
    expect(() => parseModelJson(text)).toThrow(ModelOutputError)
  })
})

describe('parseBox', () => {
  it.each([
    [[100, 200, 300, 400], [100, 200, 300, 400]],
    [[300, 400, 100, 200], [100, 200, 300, 400]], // reversed corners
    [[-5, 0, 1200, 500], [0, 0, 1000, 500]], // clamped
    [[100, 100, 100, 300], null], // no height
    [[1, 2, 3], null],
    [null, null],
    [['1', 2, 3, 4], null],
  ])('%o → %o', (input, expected) => {
    expect(parseBox(input)).toEqual(expected)
  })
})

describe('validateItems', () => {
  it('fills defaults and drops empty items', () => {
    const { items, dropped } = validateItems({
      items: [{ hanzi: ' 你好 ', pinyin: 'nǐhǎo', confidence: 3 }, { meaning: 'nothing else' }, 'garbage'],
    })
    expect(dropped).toBe(2)
    expect(items).toEqual([
      {
        kind: 'word',
        hanzi: '你好',
        pinyin: 'nǐhǎo',
        meaning: '',
        partOfSpeech: '',
        notes: '',
        hanziSource: 'inferred',
        pinyinSource: 'inferred',
        meaningSource: 'inferred',
        imageBox: null,
        confidence: 1,
      },
    ])
  })

  it('requires an items list', () => {
    expect(() => validateItems({ cards: [] })).toThrow(ModelOutputError)
  })
})
