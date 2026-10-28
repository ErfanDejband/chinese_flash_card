import { beforeEach, describe, expect, it } from 'vitest'
import { ALL_TABLES, db } from '@/data/db'
import { createCards, listActiveCards, type CardDraft } from '@/data/repositories/cards'
import { guessRoles } from './columns'
import { decodeText } from './decode'
import { wordListTsv } from './export'
import { parseTable } from './formats'
import { buildDrafts, DEFAULT_WORD_LIST_OPTIONS } from './rows'

const DRAFTS: CardDraft[] = [
  { hanzi: '老師', pinyin: 'lǎoshī', meaning: 'teacher', notes: 'line one\nline two', tags: ['hsk1', 'people'] },
  {
    hanzi: '學生',
    pinyin: 'xuésheng',
    meaning: 'student, "pupil"',
    example: { hanzi: '他是學生嗎？', pinyin: 'Tā shì xuésheng ma?', meaning: 'Is he a student?' },
    tags: ['hsk1'],
  },
  { hanzi: '謝謝', pinyin: 'xièxie', meaning: 'thanks; "thank you"', tags: [] },
  { hanzi: '咖啡', pinyin: 'kāfēi', tags: ['my tag'] },
]

/** A file read back the way the import screen does it, with the guessed columns and no options. */
function importBack(tsv: string): CardDraft[] {
  const table = parseTable(decodeText(new TextEncoder().encode(tsv)).text)
  const options = { ...DEFAULT_WORD_LIST_OPTIONS, skipExisting: false, skipKnown: false, fillPinyin: false }
  return buildDrafts(table, guessRoles(table), options, { existingHanzi: new Set(), knownHanzi: new Set() }).drafts
}

beforeEach(async () => {
  await Promise.all(ALL_TABLES().map((t) => t.clear()))
})

describe('wordListTsv', () => {
  it('writes Anki header lines and quotes fields with tabs, line breaks or quotes', () => {
    const tsv = wordListTsv([
      { ...DRAFTS[0]!, meaning: 'say "hi"', tags: DRAFTS[0]!.tags!, createdAt: 2 },
      { hanzi: '謝謝', pinyin: 'xièxie', meaning: 'thanks\tthank you', tags: [], createdAt: 1 },
    ])
    expect(tsv).toBe(
      [
        '#separator:tab',
        '#html:false',
        '#columns:Hanzi\tPinyin\tMeaning\tNotes\tExample\tExample pinyin\tExample meaning\tTags',
        '#tags column:8',
        '謝謝\txièxie\t"thanks\tthank you"\t\t\t\t\t',
        '老師\tlǎoshī\t"say ""hi"""\t"line one\nline two"\t\t\t\thsk1 people',
        '',
      ].join('\n'),
    )
  })

  it('comes back as the same cards (spaces in tags become _)', () => {
    const cards = DRAFTS.map((d, i) => ({ ...d, tags: d.tags ?? [], createdAt: i }))
    const back = importBack(wordListTsv(cards))
    expect(back).toEqual(DRAFTS.map((d) => ({ ...d, tags: d.tags!.map((t) => t.replace(' ', '_')) })))
  })

  it('exports the deck and imports it into an empty one', async () => {
    await createCards(DRAFTS, 1000)
    const tsv = wordListTsv(await listActiveCards())
    await Promise.all(ALL_TABLES().map((t) => t.clear()))

    const created = await createCards(importBack(tsv), 2000)
    expect(created.map((c) => c.hanzi)).toEqual(['老師', '學生', '謝謝', '咖啡'])
    expect(created[1]).toMatchObject({ example: DRAFTS[1]!.example, source: { type: 'manual' } })
    expect(await db.reviewStates.count()).toBe(4)
  })
})
