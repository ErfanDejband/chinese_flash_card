import { describe, expect, it } from 'vitest'
import { loadSimplifiedDetector, loadToTraditional } from '@/import/extract/traditional'
import { guessRoles } from './columns'
import { ANKI_BASIC, ANKI_EXPORT, EXCEL_SEMICOLON, PLECO_EXPORT, QUIZLET_TAB } from './fixtures'
import { parseTable } from './formats'
import { buildDrafts, DEFAULT_WORD_LIST_OPTIONS, withTag, type WordListContext, type WordListOptions } from './rows'

const EMPTY: WordListContext = { existingHanzi: new Set(), knownHanzi: new Set() }

function build(text: string, options: Partial<WordListOptions> = {}, ctx: Partial<WordListContext> = {}) {
  const table = parseTable(text)
  return buildDrafts(table, guessRoles(table), { ...DEFAULT_WORD_LIST_OPTIONS, ...options }, { ...EMPTY, ...ctx })
}

describe('buildDrafts', () => {
  it('turns an Anki export into cards with its tags', () => {
    const { drafts } = build(ANKI_EXPORT)
    expect(withTag(drafts, ' hsk1 words ')).toEqual([
      { hanzi: '老師', pinyin: 'lǎoshī', meaning: 'teacher; instructor', tags: ['hsk1-words', 'HSK1', 'people'] },
      { hanzi: '學生', pinyin: 'xué shēng', meaning: 'student, pupil', tags: ['hsk1-words', 'HSK1'] },
      { hanzi: '謝謝', pinyin: 'xièxie', meaning: 'thanks&more', tags: ['hsk1-words'] },
    ])
  })

  it('splits pinyin from the meaning on an Anki back', () => {
    expect(build(ANKI_BASIC).drafts).toEqual([
      { hanzi: '老師', pinyin: 'lǎoshī', meaning: 'teacher', tags: [] },
      { hanzi: '學生', pinyin: 'xuésheng', meaning: 'student', tags: [] },
    ])
  })

  it('splits a pinyin column holding the meaning too', () => {
    const table = parseTable('老師\t"lǎoshī\nteacher"\n學生\t"xuésheng\nstudent"\n')
    const result = buildDrafts(table, ['hanzi', 'pinyin'], DEFAULT_WORD_LIST_OPTIONS, EMPTY)
    expect(result.drafts[0]).toEqual({ hanzi: '老師', pinyin: 'lǎoshī', meaning: 'teacher', tags: [] })
  })

  it('reads Pleco: Traditional part, numbered pinyin, categories as tags', async () => {
    const isSimplified = await loadSimplifiedDetector()
    const { drafts, counts } = build(PLECO_EXPORT, {}, { isSimplified })
    expect(drafts).toEqual([
      { hanzi: '你們', pinyin: 'nǐmen', meaning: 'you (plural)', tags: ['hsk-1'] },
      { hanzi: '老師', pinyin: 'lǎoshī', meaning: 'noun teacher', tags: ['hsk-1'] },
      { hanzi: '我', pinyin: 'wǒ', meaning: 'pronoun I; me', tags: ['hsk-1'] },
      { hanzi: '米飯', pinyin: 'mǐfàn', meaning: 'cooked "rice', tags: ['food-rice'] },
    ])
    expect(counts.simplified).toBe(0)
  })

  it('splits Quizlet terms holding characters and pinyin', () => {
    expect(build(QUIZLET_TAB, { fillPinyin: false }).drafts).toEqual([
      { hanzi: '老師', pinyin: 'lǎoshī', meaning: 'teacher', tags: [] },
      { hanzi: '學生', pinyin: 'xuésheng', meaning: 'student', tags: [] },
      { hanzi: '謝謝', pinyin: '', meaning: 'thank you', tags: [] },
    ])
  })

  it('keeps examples and multi-line notes', () => {
    expect(build(EXCEL_SEMICOLON).drafts[0]).toEqual({
      hanzi: '老師',
      pinyin: 'lǎoshī',
      meaning: 'teacher; instructor',
      notes: 'line one\nline two',
      example: { hanzi: '我是老師。', pinyin: '', meaning: '' },
      tags: [],
    })
  })

  it('skips rows without characters', () => {
    const { rows, drafts, counts } = build('Lesson 1\t\t\n老師\tlǎoshī\tteacher\n')
    expect(drafts.map((d) => d.hanzi)).toEqual(['老師'])
    expect(rows[0]).toMatchObject({ index: 0, skipped: true, issues: ['no-han'] })
    expect(counts['no-han']).toBe(1)
  })

  it('skips words already in the deck or known, or keeps them when asked', () => {
    const text = '老師\tlǎoshī\tteacher\n我\twǒ\tI\n學生\txuésheng\tstudent\n'
    const ctx = { existingHanzi: new Set(['老師']), knownHanzi: new Set(['我']) }
    const skipping = build(text, {}, ctx)
    expect(skipping.drafts.map((d) => d.hanzi)).toEqual(['學生'])
    expect(skipping.rows.map((r) => r.issues)).toEqual([['duplicate-existing'], ['known'], []])
    expect(skipping.counts).toMatchObject({ 'duplicate-existing': 1, known: 1 })

    const keeping = build(text, { skipExisting: false, skipKnown: false }, ctx)
    expect(keeping.drafts.map((d) => d.hanzi)).toEqual(['老師', '我', '學生'])
  })

  it('skips repeats inside the file, but not the same characters read differently', () => {
    const { drafts, rows, counts } = build('老師\tlǎoshī\tteacher\n老師\tlǎo shī\tinstructor\n還\thái\tstill\n還\thuán\treturn\n')
    expect(drafts.map((d) => `${d.hanzi} ${d.pinyin}`)).toEqual(['老師 lǎoshī', '還 hái', '還 huán'])
    expect(rows[1]!.issues).toEqual(['duplicate-file'])
    expect(counts['duplicate-file']).toBe(1)
  })

  it('flags Simplified words, or converts them when the converter is there', async () => {
    const isSimplified = await loadSimplifiedDetector()
    const text = '老师\tlǎoshī\tteacher\t我是老师。\n學生\txuésheng\tstudent\t\n'
    const flagged = build(text, {}, { isSimplified })
    expect(flagged.drafts[0]!.hanzi).toBe('老师')
    expect(flagged.rows[0]!.issues).toEqual(['simplified'])

    const toTraditional = await loadToTraditional()
    const converted = build(text, {}, { isSimplified, toTraditional, existingHanzi: new Set(['學生']) })
    expect(converted.drafts).toEqual([{ hanzi: '老師', pinyin: 'lǎoshī', meaning: 'teacher', example: { hanzi: '我是老師。', pinyin: '', meaning: '' }, tags: [] }])
    expect(converted.counts).toMatchObject({ converted: 1, simplified: 0, 'duplicate-existing': 1 })

    const off = build(text, { convertSimplified: false }, { isSimplified, toTraditional })
    expect(off.drafts[0]!.hanzi).toBe('老师')
  })

  it('fills in missing pinyin when asked', () => {
    const filled = build('老師\t\tteacher\n學生\txuésheng\tstudent\n')
    expect(filled.drafts[0]!.pinyin).toBe('lǎoshī')
    expect(filled.rows[0]!.issues).toEqual(['pinyin-filled'])

    const empty = build('老師\t\tteacher\n學生\txuésheng\tstudent\n', { fillPinyin: false })
    expect(empty.drafts[0]!.pinyin).toBe('')
    expect(empty.counts['no-pinyin']).toBe(1)
  })

  it('flags pinyin that does not match the characters', () => {
    const { rows, counts } = build('老師\tlǎoshì\tteacher\n學生\tmāo\tstudent\n謝謝\txièxie\tthanks\n')
    expect(rows.map((r) => r.issues)).toEqual([['tone-differs'], ['pinyin-mismatch'], []])
    expect(counts).toMatchObject({ 'tone-differs': 1, 'pinyin-mismatch': 1 })
  })

  it('puts the chosen tag first, once', () => {
    expect(withTag([{ hanzi: '老師', pinyin: '', tags: ['a', 'mine'] }, { hanzi: '書', pinyin: '' }], 'mine')).toEqual([
      { hanzi: '老師', pinyin: '', tags: ['mine', 'a'] },
      { hanzi: '書', pinyin: '', tags: ['mine'] },
    ])
    expect(withTag([{ hanzi: '書', pinyin: '', tags: ['a'] }], '  ')[0]!.tags).toEqual(['a'])
  })

  it('needs a characters column', () => {
    const table = parseTable('老師\tlǎoshī\tteacher\n')
    expect(buildDrafts(table, ['ignore', 'pinyin', 'meaning'], DEFAULT_WORD_LIST_OPTIONS, EMPTY).drafts).toEqual([])
  })

  it('keeps thousands of rows quick', () => {
    const text = Array.from({ length: 5000 }, (_, i) => `${String.fromCodePoint(0x4e00 + i)}字\t\tword ${i}`).join('\n')
    const table = parseTable(text)
    const roles = guessRoles(table)
    const started = performance.now()
    const first = buildDrafts(table, roles, DEFAULT_WORD_LIST_OPTIONS, EMPTY)
    const again = buildDrafts(table, roles, { ...DEFAULT_WORD_LIST_OPTIONS, fillPinyin: false }, EMPTY)
    expect(first.drafts).toHaveLength(5000)
    expect(again.counts['no-pinyin']).toBe(5000)
    expect(performance.now() - started).toBeLessThan(10_000)
  })
})
