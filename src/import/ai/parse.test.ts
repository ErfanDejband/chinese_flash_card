import { describe, expect, it } from 'vitest'
import { BOOK2_P5_REPLY, BOOK3_P20_REPLY, READING_REPLY } from './fixtures'
import { ModelOutputError, parseBox, parseModelJson, validateItems, validateReading } from './parse'

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

describe('validateReading', () => {
  it('reads sentences with their words', () => {
    const { sentences } = validateReading(parseModelJson(READING_REPLY))
    expect(sentences.map((s) => s.words.length)).toEqual([7, 9, 6])
    expect(sentences[0]!.words[0]).toEqual({ hanzi: '小明', pinyin: 'Xiǎomíng', meaning: 'Xiaoming (a name)', role: 'name', confidence: 0.95 })
  })

  it('strips zhuyin, drops empty words and sentences, and coerces unknown values', () => {
    const { sentences } = validateReading({
      sentences: [
        {
          text: '我ㄨㄛˇ 愛ㄞˋ 你。',
          pinyin: 'Wǒ ài nǐ.',
          meaning: 'I love you.',
          words: [
            { hanzi: '我ㄨㄛˇ', pinyin: 'wǒ', meaning: 'I', role: 'pronoun', confidence: 3 },
            { hanzi: 'ㄞˋ', pinyin: '', meaning: '' },
            { hanzi: '愛', pinyin: 'ài', meaning: 'to love', role: 'word' },
          ],
        },
        { text: '', words: [] },
      ],
    })
    expect(sentences).toHaveLength(1)
    expect(sentences[0]!.text).toBe('我 愛 你。')
    expect(sentences[0]!.words).toEqual([
      { hanzi: '我', pinyin: 'wǒ', meaning: 'I', role: 'word', confidence: 1 },
      { hanzi: '愛', pinyin: 'ài', meaning: 'to love', role: 'word', confidence: 0.5 },
    ])
  })

  it('requires a sentences list', () => {
    expect(() => validateReading({ items: [] })).toThrow(ModelOutputError)
  })
})
