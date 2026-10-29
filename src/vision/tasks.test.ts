import { describe, expect, it } from 'vitest'
import { ModelOutputError } from '@/import/ai/parse'
import { cellPosition, mosaicLayout } from './mosaic'
import { defaultChoice, nameInput, validateFound, validateNames } from './tasks'

describe('mosaicLayout', () => {
  it('lays pictures out in a near-square grid, at most 4 × 4', () => {
    expect(mosaicLayout(1)).toMatchObject({ cols: 1, rows: 1, width: 224, height: 224 })
    expect(mosaicLayout(6)).toMatchObject({ cols: 3, rows: 2, width: 672, height: 448 })
    expect(mosaicLayout(9)).toMatchObject({ cols: 3, rows: 3 })
    expect(mosaicLayout(10)).toMatchObject({ cols: 4, rows: 3 })
    expect(mosaicLayout(40)).toMatchObject({ cols: 4, rows: 4 })
  })

  it('numbers cells row by row', () => {
    const layout = mosaicLayout(6)
    expect(cellPosition(layout, 0)).toEqual({ row: 1, col: 1 })
    expect(cellPosition(layout, 4)).toEqual({ row: 2, col: 2 })
  })
})

describe('nameInput', () => {
  it('lists each picture’s place and the detector’s guess', () => {
    expect(nameInput(mosaicLayout(3), ['Cup', undefined, 'Lamp'])).toBe(
      "1. row 1, column 1 · detector's guess: Cup\n2. row 1, column 2\n3. row 2, column 1 · detector's guess: Lamp",
    )
  })
})

const word = (hanzi: string, pinyin: string, meaning: string, kind: string, level: string) => ({ hanzi, pinyin, meaning, kind, level })

describe('validateNames', () => {
  it('maps word choices by picture number, everyday words first, pinyin normalised', () => {
    const names = validateNames(
      {
        objects: [
          {
            index: 2,
            words: [word('球鞋', 'qiu2xie2', 'sneakers', 'specific', 'a2'), word(' 鞋子 ', 'xiézi', 'shoes', 'everyday', 'A1'), word('鞋子', 'xiézi', 'shoes', 'everyday', 'A1')],
            category: { hanzi: '衣物', pinyin: 'yīwù', meaning: 'clothing' },
            confidence: 0.8,
          },
          { index: 1, words: [word('杯子', 'bēizi', 'cup', 'everyday', 'Z9')], category: null, confidence: 2 },
          { index: 2, words: [word('燈', 'dēng', 'lamp', 'everyday', 'A2')], category: null, confidence: 0.5 },
          { index: 7, words: [word('書', 'shū', 'book', 'everyday', 'A1')], category: null, confidence: 0.9 },
        ],
      },
      3,
    )
    expect([...names.keys()]).toEqual([2, 1])
    expect(names.get(2)).toEqual({
      words: [
        { hanzi: '鞋子', pinyin: 'xiézi', meaning: 'shoes', kind: 'everyday', level: 'A1' },
        { hanzi: '球鞋', pinyin: 'qiúxié', meaning: 'sneakers', kind: 'specific', level: 'A2' },
      ],
      category: { hanzi: '衣物', pinyin: 'yīwù', meaning: 'clothing' },
      confidence: 0.8,
    })
    expect(names.get(1)).toMatchObject({ words: [{ hanzi: '杯子', level: undefined }], category: undefined, confidence: 1 })
  })

  it('treats the first word as the everyday one when none is marked so', () => {
    const names = validateNames({ objects: [{ index: 1, words: [word('馬克杯', 'mǎkèbēi', 'mug', 'specific', 'B1')], confidence: 0.9 }] }, 1)
    expect(names.get(1)!.words[0]!.kind).toBe('everyday')
  })

  it('rejects a reply without an objects list', () => {
    expect(() => validateNames({ items: [] }, 2)).toThrow(ModelOutputError)
  })
})

describe('defaultChoice', () => {
  const shoes = [
    { hanzi: '鞋子', pinyin: 'xiézi', meaning: 'shoes', kind: 'everyday' as const, level: 'A1' as const },
    { hanzi: '球鞋', pinyin: 'qiúxié', meaning: 'sneakers', kind: 'specific' as const, level: 'A2' as const },
    { hanzi: '慢跑鞋', pinyin: 'mànpǎoxié', meaning: 'running shoes', kind: 'specific' as const, level: 'B2' as const },
  ]

  it('gives beginners the everyday word', () => {
    expect(defaultChoice(shoes, 'beginner')).toBe(0)
  })

  it('gives intermediate learners an early specific word, advanced learners the first specific one', () => {
    expect(defaultChoice(shoes, 'intermediate')).toBe(1)
    expect(defaultChoice([shoes[0]!, shoes[2]!], 'intermediate')).toBe(0)
    expect(defaultChoice([shoes[0]!, shoes[2]!], 'advanced')).toBe(1)
  })

  it('falls back to the everyday word when there is no specific one', () => {
    expect(defaultChoice([shoes[0]!], 'advanced')).toBe(0)
  })
})

describe('validateFound', () => {
  it('keeps named objects with a usable box', () => {
    const found = validateFound({
      objects: [
        { hanzi: '杯子', pinyin: 'bēizi', meaning: 'cup', box: [420, 130, 610, 260], confidence: 0.9 },
        { hanzi: '椅子', pinyin: 'yǐzi', meaning: 'chair', box: [10, 10, 10, 10], confidence: 0.9 },
        { hanzi: '', pinyin: '', meaning: '?', box: [0, 0, 500, 500], confidence: 0.1 },
      ],
    })
    expect(found).toHaveLength(1)
    expect(found[0]).toMatchObject({ hanzi: '杯子', box: [420, 130, 610, 260] })
  })
})
