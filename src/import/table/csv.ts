/** Delimited text (CSV / TSV) parsing: RFC 4180 quoting, plus a delimiter sniffer. */

export interface ParseResult {
  rows: string[][]
  /** A quote opened and never closed: the rest of the file went into one field. */
  unterminated: boolean
}

/**
 * Split text into rows of fields. With `quotes`, a field starting with `"` runs to the next lone
 * `"` (`""` is a quote) and may hold delimiters and line breaks; text after the closing quote is
 * kept as is. Rows end at \r\n, \n or \r.
 */
export function parseDelimited(text: string, delimiter: string, quotes = true): ParseResult {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let atFieldStart = true
  let inQuotes = false
  const n = text.length
  for (let i = 0; i < n; i++) {
    const c = text[i]!
    if (inQuotes) {
      if (c !== '"') field += c
      else if (text[i + 1] === '"') {
        field += '"'
        i++
      } else inQuotes = false
      continue
    }
    if (c === '"' && quotes && atFieldStart) {
      inQuotes = true
      atFieldStart = false
    } else if (c === delimiter) {
      row.push(field)
      field = ''
      atFieldStart = true
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      rows.push(row)
      row = []
      field = ''
      atFieldStart = true
    } else {
      field += c
      atFieldStart = false
    }
  }
  if (!atFieldStart || field || row.length || inQuotes) {
    row.push(field)
    rows.push(row)
  }
  return { rows, unterminated: inQuotes }
}

export const DELIMITERS = ['\t', ',', ';', '|'] as const

/**
 * The delimiter that splits the sample lines into the same number (≥ 2) of fields most
 * consistently; more fields win a tie, then the order of {@link DELIMITERS} (tab first).
 * Tab when nothing splits (a list of single words).
 */
export function sniffDelimiter(sample: string): string {
  let best: string = '\t'
  let bestScore = 0
  for (const delimiter of DELIMITERS) {
    const rows = parseDelimited(sample, delimiter).rows.filter((r) => r.some((f) => f.trim()))
    if (!rows.length) continue
    const counts = new Map<number, number>()
    for (const r of rows) counts.set(r.length, (counts.get(r.length) ?? 0) + 1)
    const [mode, hits] = [...counts].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]!
    if (mode < 2) continue
    const s = (hits / rows.length) * 10 + Math.min(mode, 12) * 0.1
    if (s > bestScore) {
      best = delimiter
      bestScore = s
    }
  }
  return best
}

/** Anki's `#separator:` value: a name (Tab, Comma, Semicolon, Pipe, Colon, Space) or the character itself. */
export function ankiSeparator(value: string): string | undefined {
  const named: Record<string, string> = { tab: '\t', comma: ',', semicolon: ';', pipe: '|', colon: ':', space: ' ' }
  const v = value.trim()
  // A literal tab or space trims away: take the character as written.
  return named[v.toLowerCase()] ?? [...v][0] ?? [...value][0]
}
