import { describe, expect, it } from 'vitest'
import { ModelOutputError } from '@/import/ai/parse'
import { cellPosition, mosaicLayout } from './mosaic'
import { nameInput, validateFound, validateNames } from './tasks'

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

describe('validateNames', () => {
  it('maps names by picture number and normalises pinyin', () => {
    const names = validateNames(
      {
        objects: [
          { index: 2, hanzi: ' 檯燈 ', pinyin: 'tai2deng1', meaning: 'desk lamp', confidence: 0.8 },
          { index: 1, hanzi: '杯子', pinyin: 'bēizi', meaning: 'cup', confidence: 2 },
          { index: 2, hanzi: '燈', pinyin: 'dēng', meaning: 'lamp', confidence: 0.5 },
          { index: 7, hanzi: '書', pinyin: 'shū', meaning: 'book', confidence: 0.9 },
        ],
      },
      3,
    )
    expect([...names.keys()]).toEqual([2, 1])
    expect(names.get(2)).toEqual({ hanzi: '檯燈', pinyin: 'táidēng', meaning: 'desk lamp', confidence: 0.8 })
    expect(names.get(1)!.confidence).toBe(1)
  })

  it('rejects a reply without an objects list', () => {
    expect(() => validateNames({ items: [] }, 2)).toThrow(ModelOutputError)
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
