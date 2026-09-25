import { describe, expect, it } from 'vitest'
import { checkPinyin, suggestPinyin } from './suggest'
import { looksLikePinyin, normalizePinyin, numberedToMarked, toSearchKey } from './tones'

describe('numberedToMarked', () => {
  it.each([
    ['lao3shi1', 'lǎoshī'],
    ['xue2sheng5', 'xuésheng'],
    ['ni3 hao3', 'nǐ hǎo'],
    ['dou1', 'dōu'], // ou → o
    ['liu2', 'liú'], // last vowel
    ['gui4', 'guì'],
    ['xue3', 'xuě'], // e wins
    ['nv3', 'nǚ'],
    ['lu:4', 'lǜ'],
    ['lve4', 'lüè'],
    ['Zhong1guo2', 'Zhōngguó'],
    ['ma0', 'ma'],
    ['er2', 'ér'],
    ['hm', 'hm'],
    ['lǎoshī', 'lǎoshī'],
  ])('%s → %s', (input, expected) => {
    expect(numberedToMarked(input)).toBe(expected)
  })
})

describe('normalizePinyin', () => {
  it('composes combining diacritics (common in PDF text)', () => {
    expect(normalizePinyin('lǎoshı̄')).toBe('lǎoshı̄') // dotless i is left alone
    expect(normalizePinyin('lǎoshī')).toBe('lǎoshī')
  })

  it('maps IPA alpha/script-g to Latin', () => {
    expect(normalizePinyin('ɡɑ̌i')).toBe('gǎi')
  })

  it('fixes breves used for the third tone', () => {
    expect(normalizePinyin('lăoshī')).toBe('lǎoshī')
  })

  it('collapses whitespace and converts numbers', () => {
    expect(normalizePinyin('  ni3   hao3 ')).toBe('nǐ hǎo')
  })
})

describe('toSearchKey', () => {
  it.each([
    ['lǎoshī', 'laoshi'],
    ['Lǎo Shī', 'laoshi'],
    ['nǚ', 'nu'],
    ['nv3', 'nu'],
    ["xī'ān", 'xian'],
  ])('%s → %s', (input, expected) => {
    expect(toSearchKey(input)).toBe(expected)
  })
})

describe('looksLikePinyin', () => {
  it.each([
    ['lǎoshī', true],
    ['xué sheng', true],
    ['lao3shi1', true],
    ['teacher', false],
    ['老師', false],
    ['', false],
    ['Lesson 3', false],
  ])('%s → %s', (input, expected) => {
    expect(looksLikePinyin(input)).toBe(expected)
  })
})

describe('suggestPinyin (pinyin-pro)', () => {
  it.each([
    ['老師', 'lǎoshī'],
    ['學生', 'xuéshēng'],
    ['老师', 'lǎoshī'],
    ['你好', 'nǐhǎo'],
  ])('%s → %s', (hanzi, expected) => {
    expect(suggestPinyin(hanzi)).toBe(expected)
  })

  it('returns empty for empty input', () => {
    expect(suggestPinyin('  ')).toBe('')
  })
})

describe('checkPinyin', () => {
  it.each([
    ['老師', 'lǎoshī', 'match'],
    ['老師', 'lǎo shī', 'match'],
    ['老師', 'lao3shi1', 'match'],
    ['老師', 'láoshī', 'tone-differs'],
    ['老師', 'xuéshēng', 'mismatch'],
    ['老師', '', 'unknown'],
  ])('%s vs %s → %s', (hanzi, given, expected) => {
    expect(checkPinyin(hanzi, given)).toBe(expected)
  })
})
