import { describe, expect, it } from 'vitest'
import { ModelOutputError } from '@/import/ai/parse'
import { sheetCost } from './estimate'
import { LOCATE_TASK, resolveBoxes, validateLocate } from './locate'
import { fallbackPlan, PLAN_TASK, planInput, validatePlan } from './plan'
import { gridBox, groupIntoSheets, layoutFor, sheetPrompt, variantsPrompt } from './sheet'
import { pictureStyle } from './styles'

describe('sheets', () => {
  it('picks the smallest grid that holds the pictures, in shapes every model supports', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 9].map((n) => layoutFor(n))).toEqual([
      { cols: 1, rows: 1, aspect: '1:1' },
      { cols: 2, rows: 1, aspect: '3:2' },
      { cols: 2, rows: 2, aspect: '1:1' },
      { cols: 2, rows: 2, aspect: '1:1' },
      { cols: 3, rows: 2, aspect: '3:2' },
      { cols: 3, rows: 2, aspect: '3:2' },
      { cols: 3, rows: 3, aspect: '1:1' },
      { cols: 3, rows: 3, aspect: '1:1' },
    ])
    expect(groupIntoSheets([1, 2, 3, 4, 5, 6, 7, 8], 6)).toEqual([[1, 2, 3, 4, 5, 6], [7, 8]])
  })

  it('cuts grid cells left to right, top to bottom, inset from the gutters', () => {
    const l = layoutFor(6)
    expect(gridBox(l, 0, 0)).toEqual([0, 0, 500, 333])
    expect(gridBox(l, 4, 0)).toEqual([500, 333, 1000, 667])
    expect(gridBox(l, 0)).toEqual([15, 10, 485, 323])
  })

  it('asks for numbered cells in the style, with no text, and leaves spare cells empty', () => {
    const prompt = sheetPrompt(pictureStyle('flat'), ['a puppy', 'a park', 'a lawn'])
    expect(prompt).toContain('grid of 2 rows and 2 columns')
    expect(prompt).toContain('simple flat vector icon')
    expect(prompt).toContain('no text, letters, numbers')
    expect(prompt).toContain('1. a puppy\n2. a park\n3. a lawn\n4. leave this cell empty')
    expect(sheetPrompt(pictureStyle('photo'), ['a puppy'])).toContain('Picture: a puppy')
    expect(variantsPrompt(pictureStyle('flat'), 'a puppy').match(/a puppy \(version \d/g)).toHaveLength(4)
  })
})

describe('planning', () => {
  const words = [
    { hanzi: '小狗', pinyin: 'xiǎogǒu', meaning: 'puppy', example: { hanzi: '他看到一隻小狗。', pinyin: '', meaning: 'He sees a puppy.' } },
    { hanzi: '很', pinyin: 'hěn', meaning: 'very' },
    { hanzi: '公園', pinyin: 'gōngyuán', meaning: 'park' },
  ]

  it('numbers the words with their meaning and example', () => {
    expect(planInput(words)).toBe('1. 小狗 (xiǎogǒu): puppy — example: 他看到一隻小狗。 (He sees a puppy.)\n2. 很 (hěn): very\n3. 公園 (gōngyuán): park')
    expect(PLAN_TASK.user('x')).toContain('x')
  })

  it('reads plans by index, keeps one emoji, and falls back for words left out', () => {
    const plans = validatePlan(
      {
        words: [
          { index: 2, picturable: false, scene: 'a big thumbs-up', emoji: '👍 very', searchQuery: 'very' },
          { index: 1, picturable: true, scene: 'a small brown puppy', emoji: '🐶', searchQuery: '' },
          { index: 9, picturable: true, scene: 'out of range', emoji: '', searchQuery: '' },
        ],
      },
      words,
    )
    expect(plans).toEqual([
      { picturable: true, scene: 'a small brown puppy', emoji: '🐶', searchQuery: 'puppy' },
      { picturable: false, scene: 'a big thumbs-up', emoji: '👍', searchQuery: 'very' },
      fallbackPlan(words[2]!),
    ])
    expect(validatePlan({ words: [{ index: 1, scene: 'x', emoji: 'abc' }] }, words)[0]!.emoji).toBe('')
    expect(() => validatePlan({ items: [] }, words)).toThrow(ModelOutputError)
  })
})

describe('locating pictures on a sheet', () => {
  const layout = layoutFor(4)

  it('reads boxes by index and drops invalid ones', () => {
    const found = validateLocate({ pictures: [{ index: 1, box: [10, 10, 450, 450] }, { index: 2, box: null }, { index: 3, box: [5, 5, 5, 5] }] })
    expect([...found.keys()]).toEqual([1])
    expect(() => validateLocate({})).toThrow(ModelOutputError)
    expect(LOCATE_TASK.user('1. puppy')).toContain('1. puppy')
  })

  it('uses plausible located boxes (padded) and the grid cell otherwise', () => {
    const found = new Map([
      [1, [520, 520, 980, 980] as [number, number, number, number]], // the model drew it in another cell
      [2, [0, 0, 1000, 1000] as [number, number, number, number]], // the whole sheet: implausible
      [3, [530, 530, 970, 970] as [number, number, number, number]], // on top of picture 1
      // 4 missing
    ])
    const { boxes, located } = resolveBoxes(layout, 4, found)
    expect(located).toEqual([true, false, false, false])
    expect(boxes[0]).toEqual([508, 508, 992, 992])
    expect(boxes[1]).toEqual(gridBox(layout, 1))
    expect(boxes[3]).toEqual(gridBox(layout, 3))
  })
})

describe('cost estimates', () => {
  it('prices OpenAI models by quality and shape, with tokens where the table has them', () => {
    expect(sheetCost('openai', 'gpt-image-1-mini', '3:2', 'low')).toEqual({ usd: 0.006, tokens: 400 })
    expect(sheetCost('openai', 'gpt-image-1-mini', '1:1', 'medium')).toEqual({ usd: 0.011, tokens: 1056 })
    expect(sheetCost('openai', 'gpt-image-2', '3:2', 'medium')).toEqual({ usd: 0.041, tokens: undefined })
    expect(sheetCost('openrouter', 'openai/gpt-image-1-mini', '3:2', 'low').usd).toBe(0.006)
  })

  it('prices Gemini models per image whatever the style, and leaves unknown models empty', () => {
    expect(sheetCost('gemini', 'gemini-3.1-flash-lite-image', '3:2', 'low')).toEqual({ usd: 0.0336, tokens: 1120 })
    expect(sheetCost('openrouter', 'google/gemini-3.1-flash-image-preview', '1:1', 'medium').usd).toBe(0.067)
    expect(sheetCost('openrouter', 'black-forest-labs/flux.2-klein-4b', '3:2', 'low')).toEqual({})
  })
})
