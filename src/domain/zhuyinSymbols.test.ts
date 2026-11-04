import { describe, expect, it } from 'vitest'
import { suggestPinyin } from './pinyin/suggest'
import { toZhuyin } from './pinyin/zhuyin'
import { spokenText, symbolInfo, ZHUYIN_SYMBOLS } from './zhuyinSymbols'

describe('the zhuyin symbols', () => {
  it('has all 37, each once', () => {
    const symbols = ZHUYIN_SYMBOLS.map((s) => s.symbol)
    expect(new Set(symbols).size).toBe(37)
    expect(symbols.length).toBe(37)
    const block = Array.from({ length: 37 }, (_, i) => String.fromCodePoint(0x3105 + i))
    expect([...symbols].sort()).toEqual(block)
  })

  it.each(ZHUYIN_SYMBOLS.map((s) => [s.symbol, s]))('%s appears in its example word', (symbol, s) => {
    expect(toZhuyin(s.example.pinyin, s.example.hanzi)).toContain(symbol)
  })

  it.each(ZHUYIN_SYMBOLS.filter((s) => s.symbol !== 'ㄟ').map((s) => [s.symbol, s]))('%s is spoken with its sound', (symbol, s) => {
    expect(toZhuyin(suggestPinyin(s.speak), s.speak)).toContain(symbol)
  })

  it('has a one-character stand-in, so the voice says one short sound', () => {
    expect(ZHUYIN_SYMBOLS.filter((s) => [...s.speak].length !== 1)).toEqual([])
  })
})

describe('symbolInfo', () => {
  it('finds a symbol and nothing else', () => {
    expect(symbolInfo('ㄅ')?.pinyin).toBe('b')
    expect(symbolInfo('老師')).toBeUndefined()
    expect(symbolInfo('ㄅㄆ')).toBeUndefined()
  })
})

describe('spokenText', () => {
  it('gives the voice the stand-in for a symbol and the characters for a word', () => {
    expect(spokenText({ hanzi: 'ㄅ' })).toBe('玻')
    expect(spokenText({ hanzi: '老師' })).toBe('老師')
  })
})
