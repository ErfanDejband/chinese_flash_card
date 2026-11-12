import { strToU8, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { guessRoles } from './columns'
import { buildDrafts, DEFAULT_WORD_LIST_OPTIONS, lessonTitles } from './rows'
import { tableFromRows, tableFromSheets } from './sheets'
import { isXlsx, readXlsx, XlsxError } from './xlsx'

/** A minimal workbook, the way Excel lays it out (shared strings, relationships, one file per sheet). */
function workbook(sheets: { name: string; xml: string }[], shared: string[] = [], prefix = '') {
  const p = prefix ? `${prefix}:` : ''
  const ns = prefix ? `xmlns:${prefix}` : 'xmlns'
  return zipSync({
    '[Content_Types].xml': strToU8('<Types/>'),
    'xl/workbook.xml': strToU8(
      `<?xml version="1.0"?><${p}workbook ${ns}="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="r"><${p}sheets>${sheets
        .map((s, i) => `<${p}sheet name="${s.name}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
        .join('')}</${p}sheets></${p}workbook>`,
    ),
    'xl/_rels/workbook.xml.rels': strToU8(
      `<Relationships>${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="ws" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}</Relationships>`,
    ),
    'xl/sharedStrings.xml': strToU8(`<sst>${shared.map((s) => `<si>${s}</si>`).join('')}</sst>`),
    ...Object.fromEntries(sheets.map((s, i) => [`xl/worksheets/sheet${i + 1}.xml`, strToU8(`<${p}worksheet ${ns}="m"><${p}sheetData>${s.xml}</${p}sheetData></${p}worksheet>`)])),
  })
}

const s = (i: number, ref: string) => `<c r="${ref}" t="s"><v>${i}</v></c>`

describe('readXlsx', () => {
  it('reads shared, rich and inline strings, numbers, booleans and formula results', () => {
    const shared = ['<t>Characters</t>', '<t>Meaning</t>', '<r><t>老</t></r><r><rPr><b/></rPr><t>師</t></r>', '<t xml:space="preserve">teacher &amp; tutor </t>', '<t>你好</t><rPh sb="0" eb="2"><t>ニーハオ</t></rPh>']
    const xml =
      `<row r="1">${s(0, 'A1')}${s(1, 'B1')}</row>` +
      `<row r="2">${s(2, 'A2')}${s(3, 'B2')}<c r="C2"><v>3</v></c></row>` +
      `<row r="4"><c r="A4" t="inlineStr"><is><t>學生</t></is></c><c r="C4" t="b"><v>1</v></c><c r="D4" t="str"><f>A1</f><v>x_x000D_y</v></c></row>` +
      `<row r="5">${s(4, 'B5')}</row><row r="6"/>`
    const [sheet] = readXlsx(workbook([{ name: 'Lesson 1', xml }], shared))
    expect(sheet!.name).toBe('Lesson 1')
    expect(sheet!.rows).toEqual([['Characters', 'Meaning'], ['老師', 'teacher & tutor', '3'], [], ['學生', '', 'TRUE', 'x\ny'], ['', '你好']])
  })

  it('reads every sheet in tab order, also with prefixed elements', () => {
    const book = workbook(
      [
        { name: 'L1', xml: `<x:row r="1"><x:c r="A1" t="inlineStr"><x:is><x:t>一</x:t></x:is></x:c></x:row>` },
        { name: 'Empty', xml: '' },
        { name: 'L2', xml: `<x:row r="1"><x:c r="B1" t="inlineStr"><x:is><x:t>二</x:t></x:is></x:c></x:row>` },
      ],
      [],
      'x',
    )
    expect(readXlsx(book)).toEqual([
      { name: 'L1', rows: [['一']] },
      { name: 'Empty', rows: [] },
      { name: 'L2', rows: [['', '二']] },
    ])
  })

  it('tells a workbook from other files', () => {
    expect(isXlsx(workbook([{ name: 'A', xml: '' }]))).toBe(true)
    expect(isXlsx(zipSync({ 'manifest.json': strToU8('{}') }))).toBe(false)
    expect(isXlsx(strToU8('漢字,pinyin'))).toBe(false)
    expect(() => readXlsx(strToU8('not a zip'))).toThrow(XlsxError)
  })
})

describe('sheets as word lists', () => {
  it('finds the header row and the roles, as for a text file', () => {
    const table = tableFromRows([
      ['Lesson', 'Type', 'Characters', 'Pinyin', 'Meaning'],
      ['1', '', '餐廳', 'cāntīng', 'restaurant'],
      ['', 'grammar', '雖然…但是…', 'suīrán… dànshì…', 'although…, (still)…'],
      ['Lesson 2', 'word', '菜單', 'càidān', 'menu, "carte"'],
    ])
    expect(table.columns).toEqual(['Lesson', 'Type', 'Characters', 'Pinyin', 'Meaning'])
    expect(guessRoles(table)).toEqual(['lesson', 'type', 'hanzi', 'pinyin', 'meaning'])
    const result = buildDrafts(table, guessRoles(table), DEFAULT_WORD_LIST_OPTIONS, { existingHanzi: new Set(), knownHanzi: new Set() })
    expect(result.drafts.map((d) => [d.hanzi, d.lesson, d.tags])).toEqual([
      ['餐廳', 'Lesson 1', []],
      ['雖然…但是…', 'Lesson 1', ['grammar']],
      ['菜單', 'Lesson 2', []],
    ])
    expect(result.drafts[2]!.meaning).toBe('menu, "carte"')
    expect(lessonTitles(result.drafts)).toEqual(['Lesson 1', 'Lesson 2'])
  })

  it('makes one lesson per sheet', () => {
    const table = tableFromSheets([
      { name: '第一課', rows: [['漢字', '英文'], ['你好', 'hello']] },
      { name: 'Notes', rows: [] },
      { name: '第二課', rows: [['漢字', '英文'], ['謝謝', 'thanks']] },
    ])
    expect(table.columns).toEqual(['Lesson', '漢字', '英文'])
    expect(table.rows).toEqual([
      ['第一課', '你好', 'hello'],
      ['第二課', '謝謝', 'thanks'],
    ])
    const roles = guessRoles(table)
    expect(roles).toEqual(['lesson', 'hanzi', 'meaning'])
    const drafts = buildDrafts(table, roles, DEFAULT_WORD_LIST_OPTIONS, { existingHanzi: new Set(), knownHanzi: new Set() }).drafts
    expect(lessonTitles(drafts)).toEqual(['第一課', '第二課'])
  })
})
