import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { guessRoles } from './columns'
import { decodeText } from './decode'
import { parseTable, type ParsedTable } from './formats'
import { buildDrafts, DEFAULT_WORD_LIST_OPTIONS, lessonTitles } from './rows'
import { tableFromRows } from './sheets'
import { isXlsx, readXlsx } from './xlsx'

/** The templates teachers download (public/templates, made by scripts/make-templates.mjs) must import as they say. */
const file = (name: string) => new Uint8Array(readFileSync(new URL(`../../../public/templates/${name}`, import.meta.url)))

function check(table: ParsedTable) {
  const roles = guessRoles(table)
  expect(roles).toEqual(['lesson', 'type', 'hanzi', 'pinyin', 'meaning', 'example', 'examplePinyin', 'exampleMeaning', 'notes'])
  const result = buildDrafts(table, roles, DEFAULT_WORD_LIST_OPTIONS, { existingHanzi: new Set(), knownHanzi: new Set() })
  expect(result.drafts).toHaveLength(5)
  expect(lessonTitles(result.drafts)).toEqual(['Lesson 1', 'Lesson 2'])
  expect(result.drafts.filter((d) => d.tags?.includes('grammar')).map((d) => d.hanzi)).toEqual(['雖然…但是…'])
  // Every reading in the template is right (Taiwan readings included).
  expect(result.rows.flatMap((r) => r.issues)).toEqual([])
  expect(result.drafts[0]!.example).toEqual({ hanzi: '我們去餐廳吃飯。', pinyin: 'Wǒmen qù cāntīng chīfàn.', meaning: 'We go to a restaurant to eat.' })
}

describe('class templates', () => {
  it('the Excel template reads back with every column and lesson', () => {
    const bytes = file('class-template.xlsx')
    expect(isXlsx(bytes)).toBe(true)
    const [sheet] = readXlsx(bytes)
    check(tableFromRows(sheet!.rows))
  })

  it('the CSV template too', () => {
    const { text, encoding } = decodeText(file('class-template.csv'))
    expect(encoding).toBe('utf-8')
    check(parseTable(text))
  })
})
