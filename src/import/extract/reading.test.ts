import { describe, expect, it } from 'vitest'
import { READING_REPLY } from '../ai/fixtures'
import { parseModelJson, validateReading } from '../ai/parse'
import type { ReadingItem } from '../types'
import type { PostprocessContext } from './postprocess'
import { alignSentence, readingDrafts } from './reading'

const ctx = (overrides: Partial<PostprocessContext> = {}): PostprocessContext => ({
  existingHanzi: new Set(),
  seenInImport: new Set(),
  ...overrides,
})

const page = () => validateReading(parseModelJson(READING_REPLY)).sentences

describe('alignSentence', () => {
  it('splits a sentence into word chips and the punctuation between them', () => {
    expect(alignSentence('小狗很可愛，小明笑了。', ['小狗', '很', '可愛', '小明', '笑', '了'])).toEqual({
      parts: [
        { text: '小狗', word: true },
        { text: '很', word: true },
        { text: '可愛', word: true },
        { text: '，', word: false },
        { text: '小明', word: true },
        { text: '笑', word: true },
        { text: '了', word: true },
        { text: '。', word: false },
      ],
      mismatch: false,
    })
  })

  it('reports characters the words skip or invent', () => {
    expect(alignSentence('我們去公園。', ['我們', '公園']).mismatch).toBe(true)
    const invented = alignSentence('我去。', ['我', '們', '去'])
    expect(invented.mismatch).toBe(true)
    expect(invented.parts.map((p) => p.text)).toEqual(['我', '去', '。'])
  })
})

describe('readingDrafts', () => {
  it('drafts each new word once, with its first sentence as the example', () => {
    const { drafts, sentences } = readingDrafts(page(), ctx())
    expect(drafts.map((d) => d.hanzi)).toEqual([
      ...['小明', '和', '媽媽', '一起', '去', '公園', '散步'],
      ...['他', '看到', '一', '隻', '小狗', '在', '草地', '上', '跑來跑去'],
      ...['很', '可愛', '笑', '了'],
    ])
    const puppy = drafts.find((d) => d.hanzi === '小狗')!
    expect(puppy).toMatchObject({
      kind: 'word',
      pinyin: 'xiǎogǒu',
      meaning: 'puppy',
      notes: '',
      imageBox: null,
      selected: true,
      example: { hanzi: '他看到一隻小狗在草地上跑來跑去。', meaning: 'He sees a puppy running around on the grass.' },
    })
    expect(sentences).toHaveLength(3)
    expect(sentences.every((s) => !s.mismatch)).toBe(true)
    expect(sentences[2]!.parts.filter((p) => p.word).map((p) => p.text)).toEqual(['小狗', '很', '可愛', '小明', '笑', '了'])
  })

  it('switches off names, particles, numbers and known words, and leaves out cards you have', () => {
    const c = ctx({ existingHanzi: new Set(['媽媽', '去']), knownHanzi: new Set(['他', '很']) })
    const { drafts } = readingDrafts(page(), c)
    const byHanzi = new Map(drafts.map((d) => [d.hanzi, d]))
    expect(byHanzi.has('媽媽')).toBe(false)
    expect(byHanzi.has('去')).toBe(false)
    expect(byHanzi.get('小明')).toMatchObject({ selected: false, flags: ['name'] })
    expect(byHanzi.get('了')).toMatchObject({ selected: false, flags: ['function-word'] })
    expect(byHanzi.get('一')).toMatchObject({ selected: false, flags: ['number'] })
    expect(byHanzi.get('他')).toMatchObject({ selected: false, flags: ['known'] })
    expect(byHanzi.get('公園')).toMatchObject({ selected: true, flags: [] })
    // Words already drafted earlier in the import (e.g. on another page) are not drafted again.
    expect(c.seenInImport.has('散步')).toBe(true)
    expect(readingDrafts(page(), c).drafts).toEqual([])
  })

  it('checks the pinyin against the characters and flags unsure words', () => {
    const items: ReadingItem[] = [
      {
        text: '我愛你。',
        pinyin: 'Wǒ ài nǐ.',
        meaning: 'I love you.',
        words: [
          { hanzi: '我', pinyin: 'wo3', meaning: 'I', role: 'word', confidence: 0.9 },
          { hanzi: '愛', pinyin: 'hǎo', meaning: 'to love', role: 'word', confidence: 0.9 },
          { hanzi: '你', pinyin: 'nǐ', meaning: 'you', role: 'word', confidence: 0.3 },
        ],
      },
    ]
    const [i, love, you] = readingDrafts(items, ctx()).drafts
    expect(i).toMatchObject({ pinyin: 'wǒ', flags: [] })
    expect(love!.flags).toEqual(['pinyin-mismatch'])
    expect(you!.flags).toEqual(['low-confidence'])
  })
})
