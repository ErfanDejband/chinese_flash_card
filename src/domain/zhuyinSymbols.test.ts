import { describe, expect, it } from 'vitest'
import { normalizePinyin } from './pinyin/tones'
import { suggestPinyin } from './pinyin/suggest'
import { toZhuyin } from './pinyin/zhuyin'
import { makeCard } from './testing'
import { outdatedSymbolCards, spokenText, symbolInfo, symbolOrder, ZHUYIN_GROUPS, ZHUYIN_SYMBOLS, ZHUYIN_TAG, ZHUYIN_TONES } from './zhuyinSymbols'

describe('the zhuyin symbols', () => {
  it('has all 37, each once', () => {
    const symbols = ZHUYIN_SYMBOLS.map((s) => s.symbol)
    expect(new Set(symbols).size).toBe(37)
    const block = Array.from({ length: 37 }, (_, i) => String.fromCodePoint(0x3105 + i))
    expect([...symbols].sort()).toEqual(block)
  })

  it('keeps the order taught in Taiwan', () => {
    expect(ZHUYIN_SYMBOLS.map((s) => s.symbol).join('')).toBe('ㄅㄆㄇㄈㄉㄊㄋㄌㄍㄎㄏㄐㄑㄒㄓㄔㄕㄖㄗㄘㄙㄧㄨㄩㄚㄛㄜㄝㄞㄟㄠㄡㄢㄣㄤㄥㄦ')
  })

  it('separates consonants, medials and vowels', () => {
    expect(ZHUYIN_GROUPS.map((g) => g.rows.flat().length)).toEqual([21, 3, 13])
  })

  it.each(ZHUYIN_SYMBOLS.map((s) => [s.symbol, s]))('%s appears in its example word', (symbol, s) => {
    expect(toZhuyin(s.example.pinyin, s.example.hanzi)).toContain(symbol)
  })

  it.each(['ㄓ', 'ㄔ', 'ㄕ', 'ㄖ', 'ㄗ', 'ㄘ', 'ㄙ'])('%s shows in its example that it can stand alone', (symbol) => {
    const { example } = symbolInfo(symbol)!
    expect(toZhuyin(example.pinyin, example.hanzi)?.replace(/[ˊˇˋ]/, '')).toBe(symbol)
  })

  it.each(ZHUYIN_SYMBOLS.filter((s) => s.symbol !== 'ㄟ').map((s) => [s.symbol, s]))('%s is spoken with its sound', (symbol, s) => {
    expect(toZhuyin(suggestPinyin(s.speak), s.speak)).toContain(symbol)
  })

  it('has a one-character stand-in, so the voice says one short sound', () => {
    expect(ZHUYIN_SYMBOLS.filter((s) => [...s.speak].length !== 1)).toEqual([])
  })

  it('holds text that saving leaves as it is, so an update can finish', () => {
    expect(ZHUYIN_SYMBOLS.filter((s) => normalizePinyin(s.pinyin) !== s.pinyin || normalizePinyin(s.example.pinyin) !== s.example.pinyin)).toEqual([])
  })
})

describe('the tone marks', () => {
  it.each(ZHUYIN_TONES.map((t) => [t.pinyin, t]))('%s is written as listed', (pinyin, t) => {
    // Alone, a toneless syllable has no marks at all, so the neutral tone needs a toned neighbour.
    expect(toZhuyin(`mā ${pinyin}`)).toBe(`ㄇㄚ ${t.symbol}`)
  })

  it.each(ZHUYIN_TONES.slice(0, 4).map((t) => [t.pinyin, t]))('%s is spoken as listed', (pinyin, t) => {
    expect(suggestPinyin(t.speak)).toBe(pinyin)
  })

  it('says the neutral tone after another syllable, where it exists', () => {
    expect(ZHUYIN_TONES.at(-1)?.speak).toBe('媽媽')
  })
})

describe('symbolInfo', () => {
  it('finds a symbol and nothing else', () => {
    expect(symbolInfo('ㄅ')?.pinyin).toBe('b')
    expect(symbolInfo('老師')).toBeUndefined()
    expect(symbolInfo('ㄅㄆ')).toBeUndefined()
  })
})

describe('symbolOrder', () => {
  it('follows the teaching order and puts anything else last', () => {
    expect(symbolOrder('ㄅ')).toBe(0)
    expect(symbolOrder('ㄈ')).toBe(3)
    expect(symbolOrder('ㄦ')).toBe(36)
    expect(symbolOrder('老師')).toBe(37)
  })
})

describe('spokenText', () => {
  it('gives the voice the stand-in for a symbol and the characters for a word', () => {
    expect(spokenText({ hanzi: 'ㄅ' })).toBe('玻')
    expect(spokenText({ hanzi: '老師' })).toBe('老師')
  })
})

describe('outdatedSymbolCards', () => {
  const b = symbolInfo('ㄅ')!
  const current = () => makeCard({ hanzi: 'ㄅ', pinyin: b.pinyin, meaning: b.hint, example: { ...b.example }, tags: [ZHUYIN_TAG] })

  it('leaves cards alone that match the table', () => {
    expect(outdatedSymbolCards([current()])).toEqual([])
  })

  it.each([
    ['pinyin', { pinyin: 'old' }],
    ['hint', { meaning: 'old' }],
    ['example', { example: { ...b.example, hanzi: '白' } }],
    ['missing example', { example: undefined }],
  ])('finds a card with a different %s', (_, change) => {
    const card = { ...current(), ...change }
    expect(outdatedSymbolCards([card])).toEqual([card])
  })

  it('ignores words and symbol cards the deck did not add', () => {
    const word = makeCard({ hanzi: '老師', pinyin: 'lǎoshī', tags: [ZHUYIN_TAG] })
    const own = { ...current(), tags: [], meaning: 'my own hint' }
    expect(outdatedSymbolCards([word, own])).toEqual([])
  })
})
