import { describe, expect, it } from 'vitest'
import { BOOK2_P5_REPLY } from '../ai/fixtures'
import { parseModelJson, validateItems } from '../ai/parse'
import type { ExtractedItem } from '../types'
import { postprocess, type PostprocessContext } from './postprocess'

const item = (overrides: Partial<ExtractedItem>): ExtractedItem => ({
  kind: 'word',
  hanzi: '老師',
  pinyin: 'lǎoshī',
  meaning: 'teacher',
  partOfSpeech: '',
  notes: '',
  hanziSource: 'printed',
  pinyinSource: 'printed',
  meaningSource: 'printed',
  imageBox: null,
  confidence: 0.9,
  ...overrides,
})

const ctx = (overrides: Partial<PostprocessContext> = {}): PostprocessContext => ({
  existingHanzi: new Set(),
  seenInImport: new Set(),
  ...overrides,
})

describe('postprocess', () => {
  it('validates inferred characters against the printed pinyin (book 2 page)', () => {
    const drafts = postprocess(validateItems(parseModelJson(BOOK2_P5_REPLY)).items, ctx())
    expect(drafts.map((d) => [d.hanzi, d.pinyin, d.flags])).toEqual([
      ['牙', 'yá', ['hanzi-inferred', 'meaning-inferred']],
      ['鴨子', 'yā zi', ['hanzi-inferred', 'meaning-inferred']],
      ['家', 'jiā', ['hanzi-inferred', 'meaning-inferred']],
      ['蝦', 'xiā', ['hanzi-inferred', 'meaning-inferred']],
    ])
    expect(drafts.every((d) => d.selected)).toBe(true)
  })

  it('flags pinyin that does not match the characters', () => {
    const [wrong, tone] = postprocess([item({ hanzi: '鴨子', pinyin: 'yá' }), item({ hanzi: '學生', pinyin: 'xuěshēng' })], ctx())
    expect(wrong!.flags).toContain('pinyin-mismatch')
    expect(tone!.flags).toContain('tone-differs')
  })

  it('normalises pinyin and merges part of speech into notes', () => {
    const [d] = postprocess([item({ pinyin: 'lao3shi1', partOfSpeech: 'N', notes: 'measure word: 位' })], ctx())
    expect(d).toMatchObject({ pinyin: 'lǎoshī', notes: 'N · measure word: 位' })
  })

  it('marks duplicates (existing deck and within the import) as unselected', () => {
    const c = ctx({ existingHanzi: new Set(['我']) })
    const drafts = postprocess([item({ hanzi: '我', pinyin: 'wǒ' }), item({ hanzi: '你', pinyin: 'nǐ' }), item({ hanzi: '你', pinyin: 'nǐ' })], c)
    expect(drafts.map((d) => [d.flags.filter((f) => f.startsWith('duplicate')), d.selected])).toEqual([
      [['duplicate-existing'], false],
      [[], true],
      [['duplicate-import'], false],
    ])
    expect(c.seenInImport).toEqual(new Set(['我', '你']))
  })

  it('flags items without Chinese characters and deselects them', () => {
    const [d] = postprocess([item({ hanzi: '', pinyin: 'yang' })], ctx())
    expect(d).toMatchObject({ flags: ['no-han'], selected: false })
  })

  it('flags probable Simplified characters', () => {
    const isSimplified = (s: string) => s.includes('师')
    const [simp, trad] = postprocess([item({ hanzi: '老师' }), item({ hanzi: '老師' })], ctx({ isSimplified }))
    expect(simp!.flags).toContain('maybe-simplified')
    expect(trad!.flags).not.toContain('maybe-simplified')
  })

  it('flags low confidence and keeps sentences spaced', () => {
    const [d] = postprocess([item({ kind: 'sentence', hanzi: '我是 老師。', pinyin: 'Wǒ shì lǎoshī.', confidence: 0.4 })], ctx())
    expect(d).toMatchObject({ hanzi: '我是 老師。', flags: ['low-confidence'] })
  })
})
