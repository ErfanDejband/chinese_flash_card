import { parseTable, type ParsedTable } from './formats'
import type { Worksheet } from './xlsx'

/** A field for tab-separated text: quoted when it holds a tab, a line break or a quote. */
const field = (cell: string) => (/[\t\n\r"]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell)

/** A sheet's rows as a word list: through the same parser as text files, so header rows and columns are found alike. */
export function tableFromRows(rows: readonly string[][]): ParsedTable {
  return parseTable(rows.map((r) => r.map(field).join('\t')).join('\n'))
}

/**
 * Several sheets as one list, each sheet a lesson: a first column holds the sheet's name. The
 * column names come from the first sheet with words; the sheets should have the same columns.
 */
export function tableFromSheets(sheets: readonly Worksheet[]): ParsedTable {
  const tables = sheets.map((s) => ({ name: s.name, table: tableFromRows(s.rows) })).filter((t) => t.table.rows.length > 0)
  const first = tables[0]?.table ?? tableFromRows([])
  const width = Math.max(first.columns.length, ...tables.map((t) => t.table.columns.length))
  const pad = (r: string[]) => Array.from({ length: width }, (_, i) => r[i] ?? '')
  return {
    format: 'csv',
    label: `Excel workbook · ${tables.length} sheets as lessons`,
    delimiter: '\t',
    columns: ['Lesson', ...pad(first.columns)],
    rows: tables.flatMap((t) => t.table.rows.map((r) => [t.name, ...pad(r)])),
    rowTags: tables.flatMap((t) => t.table.rowTags),
    fileTags: [],
    fixedRoles: ['lesson', ...pad([]).map((_, i) => first.fixedRoles[i])],
  }
}
