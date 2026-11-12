import { strFromU8, unzipSync } from 'fflate'

/**
 * A small reader for Excel workbooks (.xlsx): each sheet's cell text, in tab order. Enough for word
 * lists: shared and inline strings (rich-text runs joined, phonetic runs dropped), numbers and
 * booleans as written, formulas by their saved result. No styles, dates or merged-cell copies.
 * Plain string scanning instead of DOMParser, so it runs in tests (node) too.
 */
export interface Worksheet {
  name: string
  /** Rows of cell text, trailing empty cells and rows removed. */
  rows: string[][]
}

export class XlsxError extends Error {}

const MAX_CELLS = 500_000

/** A zip that holds an Excel workbook. */
export function isXlsx(bytes: Uint8Array): boolean {
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) return false
  try {
    return 'xl/workbook.xml' in unzipSync(bytes, { filter: (f) => f.name === 'xl/workbook.xml' })
  } catch {
    return false
  }
}

const ENTITY: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

/** XML entities, then Excel's `_x000D_` escapes for control characters. */
function decodeText(s: string): string {
  return s
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
      if (e[0] !== '#') return ENTITY[e] ?? m
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m
    })
    .replace(/_x([0-9a-f]{4})_/gi, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\r\n?/g, '\n')
}

/** Some writers prefix every element (`<x:row>`); drop the prefixes so one set of patterns fits all. */
const unprefix = (xml: string) => xml.replace(/<(\/?)[A-Za-z_][\w.-]*:/g, '<$1')

function attr(attrs: string, name: string): string | undefined {
  return new RegExp(`(?:^|\\s)${name}\\s*=\\s*"([^"]*)"`).exec(attrs)?.[1] ?? new RegExp(`(?:^|\\s)${name}\\s*=\\s*'([^']*)'`).exec(attrs)?.[1]
}

/** The text of a `<si>` or `<is>`: its `<t>` runs, without phonetic guides (`<rPh>`). */
function richText(xml: string): string {
  let text = ''
  for (const m of xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '').matchAll(/<t\b[^>]*?(?:\/>|>([\s\S]*?)<\/t>)/g)) text += m[1] ?? ''
  return decodeText(text)
}

/** `B12` → 1 (the column, 0-based). */
function columnIndex(ref: string): number | undefined {
  const letters = /^([A-Z]+)\d*$/i.exec(ref)?.[1]
  if (!letters) return undefined
  let n = 0
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}

function readSheet(xml: string, shared: string[]): string[][] {
  const rows: string[][] = []
  let cells = 0
  for (const row of xml.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const r = Number(attr(row[1]!, 'r'))
    const index = Number.isInteger(r) && r > 0 ? r - 1 : rows.length
    const cellsOut: string[] = []
    for (const c of (row[2] ?? '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      if (++cells > MAX_CELLS) throw new XlsxError('This workbook is too big for a word list.')
      const attrs = c[1]!
      const body = c[2] ?? ''
      const type = attr(attrs, 't')
      const value = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(body)?.[1]
      let text = ''
      if (type === 's') text = shared[Number(value)] ?? ''
      else if (type === 'inlineStr') text = richText(/<is\b[^>]*>([\s\S]*?)<\/is>/.exec(body)?.[1] ?? '')
      else if (type === 'b') text = value === '1' ? 'TRUE' : value === '0' ? 'FALSE' : ''
      else if (value !== undefined) text = decodeText(value)
      const col = columnIndex(attr(attrs, 'r') ?? '') ?? cellsOut.length
      cellsOut[col] = text
    }
    rows[index] = Array.from(cellsOut, (v) => (v ?? '').trim())
  }
  const filled = Array.from(rows, (r) => {
    const cells = r ?? []
    let end = cells.length
    while (end > 0 && !cells[end - 1]) end--
    return cells.slice(0, end)
  })
  let end = filled.length
  while (end > 0 && !filled[end - 1]!.length) end--
  return filled.slice(0, end)
}

/** Resolve a relationship target against `xl/` (`worksheets/sheet1.xml`, `/xl/worksheets/sheet1.xml`). */
function sheetPath(target: string): string {
  if (target.startsWith('/')) return target.slice(1)
  const parts = ['xl']
  for (const p of target.split('/')) {
    if (p === '..') parts.pop()
    else if (p && p !== '.') parts.push(p)
  }
  return parts.join('/')
}

/** Every sheet of the workbook in tab order (empty sheets included, with no rows). */
export function readXlsx(bytes: Uint8Array): Worksheet[] {
  let files: Record<string, Uint8Array>
  try {
    files = unzipSync(bytes)
  } catch {
    throw new XlsxError('This file is not an Excel workbook (.xlsx).')
  }
  const text = (name: string) => (files[name] ? unprefix(strFromU8(files[name])) : undefined)
  const workbook = text('xl/workbook.xml')
  if (!workbook) throw new XlsxError('This file is not an Excel workbook (.xlsx).')

  const rels = new Map<string, string>()
  for (const m of (text('xl/_rels/workbook.xml.rels') ?? '').matchAll(/<Relationship\b([^>]*?)\/?>/g)) {
    const id = attr(m[1]!, 'Id')
    const target = attr(m[1]!, 'Target')
    if (id && target) rels.set(id, sheetPath(target))
  }
  const shared = [...(text('xl/sharedStrings.xml') ?? '').matchAll(/<si\b[^>]*?(?:\/>|>([\s\S]*?)<\/si>)/g)].map((m) => richText(m[1] ?? ''))

  const sheets: Worksheet[] = []
  for (const [i, m] of [...workbook.matchAll(/<sheet\b([^>]*?)\/?>/g)].entries()) {
    const name = decodeText(attr(m[1]!, 'name') ?? `Sheet ${i + 1}`)
    const path = rels.get(attr(m[1]!, 'r:id') ?? attr(m[1]!, 'id') ?? '') ?? `xl/worksheets/sheet${i + 1}.xml`
    const xml = text(path)
    sheets.push({ name, rows: xml ? readSheet(xml, shared) : [] })
  }
  return sheets
}
