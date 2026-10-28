import { looksLikePinyin } from '@/domain/pinyin/tones'
import { roleFromName, type ColumnRole } from './columns'
import { ankiSeparator, parseDelimited, sniffDelimiter } from './csv'

/** Word lists other apps export, plus any spreadsheet saved as CSV/TSV. */
export type TableFormat = 'anki' | 'pleco' | 'quizlet' | 'csv'

export interface ParsedTable {
  format: TableFormat
  /** "Looks like an Anki export". */
  label: string
  delimiter: string
  /** One per column: the header row's or Anki's `#columns:` name, '' when unnamed. */
  columns: string[]
  /** Data rows, cleaned (HTML, sound tags and Pleco formatting removed), each `columns.length` long. */
  rows: string[][]
  /** Tags for each row: its Pleco category. */
  rowTags: string[][]
  /** Tags for every row: Anki's `#tags:`. */
  fileTags: string[]
  /** Roles the file itself states (Anki's `#tags column:`, `#guid column:`…), by column. */
  fixedRoles: (ColumnRole | undefined)[]
}

const MAX_COLUMNS = 30

/** Pleco's formatting codes (bold, colours) and other private-use characters. */
const PRIVATE_USE = /[\uE000-\uF8FF]/g

const ENTITIES: Record<string, string> = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

/** Anki fields: line breaks from `<br>` and blocks (`a<div>b</div>`), other tags dropped, entities decoded. */
export function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>|<\/?(?:div|p|li|tr|h[1-6])\b[^>]*>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/\n+/g, '\n')
    .replace(/^\n|\n$/g, '')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, name: string) => {
      if (name[0] !== '#') return ENTITIES[name.toLowerCase()] ?? entity
      const code = name[1] === 'x' || name[1] === 'X' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10)
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : entity
    })
}

const SOUND = /\[sound:[^\]]*\]/g
const HTML_HINT = /<(?:br|div|span|p|b|i|u|img|font)\b[^>]*>|&nbsp;/i

interface AnkiHeader {
  separator?: string
  html?: boolean
  columns?: string
  tags: string[]
  /** 0-based column → role. */
  fixed: Map<number, ColumnRole>
}

const ANKI_LINE = /^#(separator|html|tags|columns|notetype|deck|guid column|notetype column|deck column|tags column|if matches):(.*)$/i
const FIXED_COLUMN: Record<string, ColumnRole> = { 'tags column': 'tags', 'guid column': 'ignore', 'notetype column': 'ignore', 'deck column': 'ignore' }

/** Anki's `#key:value` lines at the top of a "Notes in Plain Text" export, and the text after them. */
function splitAnkiHeader(text: string): { header?: AnkiHeader; body: string } {
  const header: AnkiHeader = { tags: [], fixed: new Map() }
  let found = false
  let pos = 0
  while (pos < text.length) {
    const end = text.slice(pos).search(/\r\n|\n|\r/)
    const line = end === -1 ? text.slice(pos) : text.slice(pos, pos + end)
    const m = ANKI_LINE.exec(line)
    if (!m) break
    found = true
    const key = m[1]!.toLowerCase()
    const value = m[2]!
    if (key === 'separator') header.separator = ankiSeparator(value)
    else if (key === 'html') header.html = value.trim().toLowerCase() === 'true'
    else if (key === 'columns') header.columns = value
    else if (key === 'tags') header.tags = value.split(/\s+/).filter(Boolean)
    else if (FIXED_COLUMN[key]) {
      const col = Number(value.trim())
      if (Number.isInteger(col) && col >= 1) header.fixed.set(col - 1, FIXED_COLUMN[key])
    }
    pos += end === -1 ? line.length : end + (text.startsWith('\r\n', pos + end) ? 2 : 1)
  }
  return found ? { header, body: text.slice(pos) } : { body: text }
}

/** Lines to sniff the delimiter from: no comment, category or blank lines. */
function sampleLines(body: string): string {
  return body
    .split(/\r\n|\n|\r/)
    .filter((l) => l.trim() && !l.startsWith('//') && !l.startsWith('#'))
    .slice(0, 50)
    .join('\n')
}

const BRACKETED = /^\p{Script=Han}+\s*[[［]\p{Script=Han}+[\]］]$/u
const NUMBERED = /^(?:[a-zü]+:?[1-5]\s*)+$/i
const isCategory = (row: string[]) => row.length === 1 && row[0]!.trimStart().startsWith('//')

/** Pleco "Export Cards": tab-separated, `// Category` lines, `简[繁]` headwords, numbered pinyin, private-use formatting. */
function looksLikePleco(rows: string[][], body: string): boolean {
  if (/[\uE000-\uF8FF]/.test(body) || rows.some(isCategory)) return true
  const data = rows.filter((r) => r.length >= 2)
  if (!data.length) return false
  const bracketed = data.filter((r) => BRACKETED.test(r[0]!.trim())).length
  const numbered = data.filter((r) => NUMBERED.test(r[1]!.trim())).length
  return bracketed >= data.length * 0.3 || numbered >= data.length * 0.5
}

const HAN = /\p{Script=Han}/u

/**
 * A first row of column names: no pinyin, and two different known names, or one known name
 * without characters above rows with characters (`Chinese,Lesson`).
 */
function isHeaderRow(cells: string[], next: string[][]): boolean {
  const filled = cells.filter((c) => c.trim())
  if (!filled.length || filled.some((c) => looksLikePinyin(c))) return false
  const roles = filled.map(roleFromName).filter((r) => r !== undefined)
  if (new Set(roles.map((r) => r.role)).size >= 2) return true
  return roles.length > 0 && !filled.some((c) => HAN.test(c)) && next.slice(0, 20).some((r) => r.some((c) => HAN.test(c)))
}

/** Lowercase, words joined with `-`: `HSK 1 Vocab` → `hsk-1-vocab`. Characters stay. */
export function slugTag(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
}

/** The default tag for a file's cards: `HSK1 Vocab.csv` → `hsk1-vocab`. */
export function tagFromFileName(fileName: string): string {
  return slugTag(fileName.replace(/\.[^.]*$/, ''))
}

function csvLabel(delimiter: string, columns: number): string {
  if (columns === 1) return 'Looks like a list of words, one per line'
  if (delimiter === '\t') return 'Looks like a tab-separated list (TSV)'
  if (delimiter === ',') return 'Looks like a CSV file'
  if (delimiter === ';') return 'Looks like a CSV file (with semicolons)'
  return `Looks like a list separated by “${delimiter}”`
}

/**
 * Parse a word list. Detection: Anki by its `#separator:`/`#html:`… header lines (or tab-separated
 * fields with `[sound:…]` or HTML); Pleco by tab-separated `// Category` lines, private-use
 * formatting, `简[繁]` headwords or numbered pinyin; Quizlet by two columns (tab or comma) without
 * a header row; anything else is a CSV/TSV, with a header row when it names known columns.
 */
export function parseTable(input: string): ParsedTable {
  const text = input.replace(/^\uFEFF/, '')
  const { header: anki, body } = splitAnkiHeader(text)
  const delimiter = anki?.separator ?? sniffDelimiter(sampleLines(body))

  const plain = parseDelimited(body, delimiter, false).rows.filter((r) => r.some((c) => c.trim()))
  const pleco = !anki && delimiter === '\t' && looksLikePleco(plain, body)
  let rows = plain
  if (!pleco) {
    // Quoted fields, unless a stray quote would swallow the rest of the file.
    const quoted = parseDelimited(body, delimiter, true)
    if (!quoted.unterminated) rows = quoted.rows.filter((r) => r.some((c) => c.trim()))
  }

  const ankiLike = Boolean(anki) || (!pleco && delimiter === '\t' && rows.some((r) => r.some((c) => c.includes('[sound:') || HTML_HINT.test(c))))
  const html = anki?.html ?? ankiLike

  // Pleco categories become tags of the rows below them.
  const rowTags: string[][] = []
  const data: string[][] = []
  let category: string[] = []
  for (const row of rows) {
    if (pleco && isCategory(row)) {
      const name = slugTag(row[0]!.trim().slice(2))
      category = name ? [name] : []
      continue
    }
    data.push(row)
    rowTags.push(category)
  }

  let names: string[] = []
  if (anki?.columns !== undefined) names = parseDelimited(anki.columns, delimiter).rows[0] ?? []
  else if (!pleco && data[0] && isHeaderRow(data[0], data.slice(1))) {
    names = data.shift()!
    rowTags.shift()
  }

  // Quizlet: term and definition. It doesn't quote, so with commas the definition may be split up.
  let format: TableFormat = ankiLike ? 'anki' : pleco ? 'pleco' : 'csv'
  if (format === 'csv' && !names.length && (delimiter === '\t' || delimiter === ',')) {
    const pairs = data.filter((r) => r.length === 2).length
    if (pairs >= data.length / 2 && (delimiter === ',' || data.every((r) => r.length <= 2))) format = 'quizlet'
  }
  if (format === 'quizlet') {
    for (const [i, r] of data.entries()) if (r.length > 2) data[i] = [r[0]!, r.slice(1).join(delimiter)]
  }

  const clean = (cell: string) => {
    let s = cell.replace(PRIVATE_USE, ' ')
    if (ankiLike) s = s.replace(SOUND, '')
    if (html) s = stripHtml(s)
    return s
      .split(/\r\n|\n|\r/)
      .map((line) => line.replace(/[ \t\u00A0\u3000]+/g, ' ').trim())
      .filter(Boolean)
      .join('\n')
  }
  const cleaned = data.map((r) => r.slice(0, MAX_COLUMNS).map(clean))
  const keep = cleaned.map((r) => r.some(Boolean))
  const n = Math.min(
    cleaned.reduce((max, r) => Math.max(max, r.length), Math.max(1, names.length)),
    MAX_COLUMNS,
  )
  const pad = (r: string[]) => Array.from({ length: n }, (_, i) => r[i] ?? '')

  return {
    format,
    label:
      format === 'anki'
        ? 'Looks like an Anki export'
        : format === 'pleco'
          ? 'Looks like a Pleco export'
          : format === 'quizlet'
            ? 'Looks like a Quizlet export'
            : csvLabel(delimiter, n),
    delimiter,
    columns: pad(names.map((name) => clean(name).replace(/\n/g, ' '))),
    rows: cleaned.filter((_, i) => keep[i]).map(pad),
    rowTags: rowTags.filter((_, i) => keep[i]),
    fileTags: anki?.tags ?? [],
    fixedRoles: Array.from({ length: n }, (_, i) => anki?.fixed.get(i)),
  }
}

/** Characters with spaces between them joined (`老 師` → `老師`), other spacing collapsed. */
export function cleanHanzi(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/(\p{Script=Han}) (?=\p{Script=Han})/gu, '$1')
    .trim()
}

const VARIANTS = /^(\p{Script=Han}+)\s*[[［]\s*(\p{Script=Han}+)\s*[\]］]$/u

/**
 * `你们[你們]` (Pleco: Simplified[Traditional]) → `你們`. When the bracketed form is the
 * Simplified one (`你們[你们]`), the other is kept.
 */
export function traditionalOf(hanzi: string, isSimplified?: (text: string) => boolean): string {
  const m = VARIANTS.exec(hanzi.trim())
  if (!m) return hanzi
  const outer = m[1]!
  const inner = m[2]!
  return isSimplified?.(inner) && !isSimplified(outer) ? outer : inner
}

const HAN_FIRST = /^(\p{Script=Han}[\p{Script=Han}\s]*?)\s*(?:[(（]\s*([^()（）]+?)\s*[)）]|\s([^\p{Script=Han}()（）]+))$/u
const PINYIN_FIRST = /^([^\p{Script=Han}()（）]+?)\s*(?:[(（]\s*(\p{Script=Han}+)\s*[)）]|\s(\p{Script=Han}[\p{Script=Han}\s]*))$/u

const TONED = /[0-5]|[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/i

/** Pinyin words: tone marks or numbers, every word toned or short (neutral tone: `ma`, `men`); not `lǎoshī teacher`. */
function isPinyinPhrase(text: string): boolean {
  return looksLikePinyin(text) && text.split(/\s+/).every((w) => TONED.test(w.normalize('NFC')) || /^[a-zü]{1,4}[.,!?]?$/i.test(w))
}

/**
 * Quizlet terms often hold both: `老師 lǎoshī`, `老師 (lǎoshī)`, `lǎoshī 老師`. Split when the
 * Latin part is pinyin (tone marks or numbers); `卡拉OK` or `老師 teacher` stay whole.
 */
export function splitHanziPinyin(cell: string): { hanzi: string; pinyin: string } | undefined {
  const text = cell.replace(/\s+/g, ' ').trim()
  const a = HAN_FIRST.exec(text)
  const aPinyin = a ? (a[2] ?? a[3] ?? '').trim() : ''
  if (a && isPinyinPhrase(aPinyin)) return { hanzi: a[1]!.trim(), pinyin: aPinyin }
  const b = PINYIN_FIRST.exec(text)
  const bPinyin = b ? b[1]!.trim() : ''
  if (b && isPinyinPhrase(bPinyin)) return { hanzi: (b[2] ?? b[3] ?? '').trim(), pinyin: bPinyin }
  return undefined
}
