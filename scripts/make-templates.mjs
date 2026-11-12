// Writes the word-list templates teachers can download: public/templates/class-template.{xlsx,csv}.
// Run once after changing the rows (`node scripts/make-templates.mjs`); the files are committed, and
// src/import/table/templates.test.ts reads them back through the app's own reader.
import { mkdirSync, writeFileSync } from 'node:fs'
import { strToU8, zipSync } from 'fflate'

const HEADER = ['Lesson', 'Type', 'Characters', 'Pinyin', 'Meaning', 'Example', 'Example pinyin', 'Example meaning', 'Notes']
const ROWS = [
  [1, 'word', '餐廳', 'cāntīng', 'restaurant', '我們去餐廳吃飯。', 'Wǒmen qù cāntīng chīfàn.', 'We go to a restaurant to eat.', 'measure word 家'],
  [1, 'word', '菜單', 'càidān', 'menu', '請給我菜單。', 'Qǐng gěi wǒ càidān.', 'Please give me the menu.', ''],
  [1, 'grammar', '雖然…但是…', 'suīrán… dànshì…', 'although…, (still)…', '雖然很貴，但是很好吃。', 'Suīrán hěn guì, dànshì hěn hǎochī.', 'It’s expensive, but it’s delicious.', ''],
  [2, 'word', '火車站', 'huǒchēzhàn', 'train station', '火車站在哪裡？', 'Huǒchēzhàn zài nǎlǐ?', 'Where is the train station?', ''],
  [2, 'word', '垃圾', 'lèsè', 'garbage', '', '', '', 'Taiwan reading (mainland: lājī)'],
]

const xml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const col = (i) => String.fromCharCode(65 + i)
const cell = (value, ref, style) =>
  typeof value === 'number'
    ? `<c r="${ref}"${style}><v>${value}</v></c>`
    : `<c r="${ref}" t="inlineStr"${style}><is><t xml:space="preserve">${xml(value)}</t></is></c>`
const row = (values, r, style = '') => `<row r="${r}">${values.map((v, i) => (v === '' ? '' : cell(v, `${col(i)}${r}`, style))).join('')}</row>`
const widths = [9, 10, 14, 18, 24, 26, 30, 32, 28]

const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${widths
  .map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`)
  .join('')}</cols><sheetData>${row(HEADER, 1, ' s="1"')}${ROWS.map((r, i) => row(r, i + 2)).join('')}</sheetData></worksheet>`

const files = {
  '[Content_Types].xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
  '_rels/.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
  'xl/workbook.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Cards" sheetId="1" r:id="rId1"/></sheets></workbook>`,
  'xl/_rels/workbook.xml.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
  'xl/styles.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs></styleSheet>`,
  'xl/worksheets/sheet1.xml': sheet,
}

const csvField = (v) => {
  const s = String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

mkdirSync('public/templates', { recursive: true })
writeFileSync('public/templates/class-template.xlsx', zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strToU8(v)]))))
// A byte-order mark, so Excel opens the characters as UTF-8.
writeFileSync('public/templates/class-template.csv', '\uFEFF' + [HEADER, ...ROWS].map((r) => r.map(csvField).join(',')).join('\r\n') + '\r\n')
console.log('Wrote public/templates/class-template.xlsx and .csv')
