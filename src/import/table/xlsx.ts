import { strFromU8, unzipSync } from 'fflate'
import { pictureMarker } from './pictures'

/**
 * A small reader for Excel workbooks (.xlsx): each sheet's cell text, in tab order. Enough for word
 * lists: shared and inline strings (rich-text runs joined, phonetic runs dropped), numbers and
 * booleans as written, formulas by their saved result. No styles, dates or merged-cell copies.
 * Pictures, placed in a cell or floating over one, come back as a marker in their cell (see
 * pictures.ts). Plain string scanning instead of DOMParser, so it runs in tests (node) too.
 */
export interface Worksheet {
  name: string
  /** Rows of cell text, trailing empty cells and rows removed. */
  rows: string[][]
}

export interface WorkbookPicture {
  data: Uint8Array
  mime: string
}

export interface Workbook {
  sheets: Worksheet[]
  /** The pictures the markers in the cells point to. */
  pictures: WorkbookPicture[]
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

/** `vm` (a cell's value-metadata index) → the picture's marker, for pictures placed in cells. */
type CellPicture = (vm: number) => string | undefined

function readSheet(xml: string, shared: string[], cellPicture: CellPicture): string[][] {
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
      const vm = Number(attr(attrs, 'vm'))
      let text = ''
      const picture = Number.isInteger(vm) && vm > 0 ? cellPicture(vm) : undefined
      if (picture) text = picture
      else if (type === 's') text = shared[Number(value)] ?? ''
      else if (type === 'inlineStr') text = richText(/<is\b[^>]*>([\s\S]*?)<\/is>/.exec(body)?.[1] ?? '')
      else if (type === 'b') text = value === '1' ? 'TRUE' : value === '0' ? 'FALSE' : ''
      else if (value !== undefined) text = decodeText(value)
      const col = columnIndex(attr(attrs, 'r') ?? '') ?? cellsOut.length
      cellsOut[col] = text
    }
    rows[index] = Array.from(cellsOut, (v) => (v ?? '').trim())
  }
  return Array.from(rows, (r) => r ?? [])
}

/** Trailing empty cells and rows removed. */
function trim(rows: string[][]): string[][] {
  const out = rows.map((cells) => {
    let end = cells.length
    while (end > 0 && !cells[end - 1]) end--
    return cells.slice(0, end)
  })
  let end = out.length
  while (end > 0 && !out[end - 1]!.length) end--
  return out.slice(0, end)
}

/** A part path from a relationship target, relative to the part that names it (`/xl/media/a.png` or `../media/a.png`). */
function resolvePart(fromPart: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1)
  const parts = fromPart.split('/').slice(0, -1)
  for (const p of target.split('/')) {
    if (p === '..') parts.pop()
    else if (p && p !== '.') parts.push(p)
  }
  return parts.join('/')
}

const MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  bmp: 'image/bmp',
  webp: 'image/webp',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  svg: 'image/svg+xml',
  emf: 'image/emf',
  wmf: 'image/wmf',
}

/** Every sheet of the workbook in tab order (empty sheets included, with no rows), and its pictures. */
export function readXlsx(bytes: Uint8Array): Workbook {
  let files: Record<string, Uint8Array>
  try {
    files = unzipSync(bytes)
  } catch {
    throw new XlsxError('This file is not an Excel workbook (.xlsx).')
  }
  const text = (name: string) => (files[name] ? unprefix(strFromU8(files[name])) : undefined)
  const workbook = text('xl/workbook.xml')
  if (!workbook) throw new XlsxError('This file is not an Excel workbook (.xlsx).')

  /** A part's relationships: id → part path. */
  const relsOf = (part: string) => {
    const slash = part.lastIndexOf('/')
    const relsPath = `${part.slice(0, slash)}/_rels/${part.slice(slash + 1)}.rels`
    const rels = new Map<string, string>()
    for (const m of (text(relsPath) ?? '').matchAll(/<Relationship\b([^>]*?)\/?>/g)) {
      const id = attr(m[1]!, 'Id')
      const target = attr(m[1]!, 'Target')
      if (id && target && attr(m[1]!, 'TargetMode') !== 'External') rels.set(id, resolvePart(part, target))
    }
    return rels
  }

  // Pictures are stored once each and found again by their part path.
  const pictures: WorkbookPicture[] = []
  const pictureIndex = new Map<string, number>()
  const markerFor = (path: string | undefined): string | undefined => {
    if (!path || !files[path]) return undefined
    let index = pictureIndex.get(path)
    if (index === undefined) {
      index = pictures.length
      pictures.push({ data: files[path], mime: MIME[path.split('.').pop()!.toLowerCase()] ?? 'application/octet-stream' })
      pictureIndex.set(path, index)
    }
    return pictureMarker(index)
  }

  const cellPicture = inCellPictures(text, relsOf)

  const shared = [...(text('xl/sharedStrings.xml') ?? '').matchAll(/<si\b[^>]*?(?:\/>|>([\s\S]*?)<\/si>)/g)].map((m) => richText(m[1] ?? ''))
  const workbookRels = relsOf('xl/workbook.xml')

  const sheets: Worksheet[] = []
  for (const [i, m] of [...workbook.matchAll(/<sheet\b([^>]*?)\/?>/g)].entries()) {
    const name = decodeText(attr(m[1]!, 'name') ?? `Sheet ${i + 1}`)
    const path = workbookRels.get(attr(m[1]!, 'r:id') ?? attr(m[1]!, 'id') ?? '') ?? `xl/worksheets/sheet${i + 1}.xml`
    const xml = text(path)
    if (!xml) {
      sheets.push({ name, rows: [] })
      continue
    }
    const rows = readSheet(xml, shared, (vm) => markerFor(cellPicture(vm)))
    placeFloating(xml, path, rows, text, relsOf, markerFor)
    sheets.push({ name, rows: trim(rows) })
  }
  return { sheets, pictures }
}

type TextOf = (name: string) => string | undefined
type RelsOf = (part: string) => Map<string, string>

/**
 * Pictures placed in cells (Excel's Place in Cell): a cell's `vm` → metadata.xml's value metadata
 * (1-based) → its rich-value block → the rich value (richData/rdrichvalue.xml) → its local image
 * key (by the structure's key order) → richValueRel.xml's relationship → the media part.
 */
function inCellPictures(text: TextOf, relsOf: RelsOf): (vm: number) => string | undefined {
  const metadata = text('xl/metadata.xml')
  const values = text('xl/richData/rdrichvalue.xml')
  if (!metadata || !values) return () => undefined

  const future = /<futureMetadata\b[^>]*name="XLRICHVALUE"[^>]*>([\s\S]*?)<\/futureMetadata>/.exec(metadata)?.[1] ?? ''
  const richIndex = [...future.matchAll(/<bk\b[^>]*>([\s\S]*?)<\/bk>/g)].map((b) => Number(/<rvb\b[^>]*\bi="(\d+)"/.exec(b[1]!)?.[1]))
  const valueMeta = /<valueMetadata\b[^>]*>([\s\S]*?)<\/valueMetadata>/.exec(metadata)?.[1] ?? ''
  const blocks = [...valueMeta.matchAll(/<bk\b[^>]*>([\s\S]*?)<\/bk>/g)].map((b) => Number(/<rc\b[^>]*\bv="(\d+)"/.exec(b[1]!)?.[1]))

  const structures = [...(text('xl/richData/rdrichvaluestructure.xml') ?? '').matchAll(/<s\b[^>]*>([\s\S]*?)<\/s>/g)].map((s) =>
    [...s[1]!.matchAll(/<k\b([^>]*?)\/?>/g)].map((k) => attr(k[1]!, 'n') ?? ''),
  )
  const rich = [...values.matchAll(/<rv\b([^>]*)>([\s\S]*?)<\/rv>/g)].map((rv) => ({
    structure: Number(attr(rv[1]!, 's')),
    values: [...rv[2]!.matchAll(/<v\b[^>]*>([\s\S]*?)<\/v>/g)].map((v) => v[1]!),
  }))

  const relPart = 'xl/richData/richValueRel.xml'
  const relIds = [...(text(relPart) ?? '').matchAll(/<rel\b([^>]*?)\/?>/g)].map((r) => attr(r[1]!, 'r:id') ?? attr(r[1]!, 'id') ?? '')
  const rels = relsOf(relPart)

  return (vm) => {
    const block = blocks[vm - 1]
    const rv = block === undefined ? undefined : rich[richIndex[block] ?? -1]
    if (!rv) return undefined
    const keys = structures[rv.structure] ?? []
    const at = keys.indexOf('_rvRel:LocalImageIdentifier')
    const rel = Number(rv.values[at >= 0 ? at : 0])
    return rels.get(relIds[rel] ?? '')
  }
}

/**
 * Pictures floating over the sheet: each is anchored to cells in the sheet's drawing. It goes into
 * the cell under its middle (its top-left cell for one-cell anchors); when that cell has text, into
 * a column after the last one, so no text is lost.
 */
function placeFloating(sheetXml: string, sheetPath: string, rows: string[][], text: TextOf, relsOf: RelsOf, markerFor: (path: string | undefined) => string | undefined) {
  const drawingId = /<drawing\b([^>]*?)\/?>/.exec(sheetXml)?.[1]
  const drawingPath = drawingId ? relsOf(sheetPath).get(attr(drawingId, 'r:id') ?? '') : undefined
  const drawing = drawingPath ? text(drawingPath) : undefined
  if (!drawingPath || !drawing) return
  const rels = relsOf(drawingPath)

  const placed: { row: number; col: number; marker: string }[] = []
  for (const a of drawing.matchAll(/<(twoCellAnchor|oneCellAnchor)\b[^>]*>([\s\S]*?)<\/\1>/g)) {
    const body = a[2]!
    const embed = /<blip\b([^>]*?)\/?>/.exec(body)?.[1]
    const marker = embed ? markerFor(rels.get(attr(embed, 'r:embed') ?? '')) : undefined
    if (!marker) continue
    const at = (tag: string) => {
      const m = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`).exec(body)?.[1] ?? ''
      return { col: Number(/<col>(\d+)<\/col>/.exec(m)?.[1]), row: Number(/<row>(\d+)<\/row>/.exec(m)?.[1]) }
    }
    const from = at('from')
    if (!Number.isInteger(from.col) || !Number.isInteger(from.row)) continue
    const to = a[1] === 'twoCellAnchor' ? at('to') : from
    const mid = (x: number, y: number) => (Number.isInteger(y) ? Math.floor((x + y) / 2) : x)
    placed.push({ row: mid(from.row, to.row), col: mid(from.col, to.col), marker })
  }

  let extra: number | undefined
  for (const p of placed) {
    const row = (rows[p.row] ??= [])
    if (!row[p.col]) {
      row[p.col] = p.marker
      continue
    }
    extra ??= Math.max(...rows.map((r) => r?.length ?? 0))
    row[extra] = row[extra] ? `${row[extra]}\n${p.marker}` : p.marker
  }
  for (let i = 0; i < rows.length; i++) rows[i] = Array.from(rows[i] ?? [], (v) => v ?? '')
}
