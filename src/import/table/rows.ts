import type { CardDraft } from '@/data/repositories/cards'
import { containsHan } from '@/domain/cjk'
import { checkPinyin, suggestPinyin } from '@/domain/pinyin/suggest'
import { looksLikePinyin, normalizePinyin } from '@/domain/pinyin/tones'
import type { ColumnRole } from './columns'
import { cleanHanzi, splitHanziPinyin, traditionalOf, type ParsedTable } from './formats'

export interface WordListOptions {
  skipExisting: boolean
  skipKnown: boolean
  /** Convert Simplified characters to Traditional (needs `toTraditional` in the context). */
  convertSimplified: boolean
  /** Missing pinyin from the dictionary. */
  fillPinyin: boolean
}

export const DEFAULT_WORD_LIST_OPTIONS: WordListOptions = {
  skipExisting: true,
  skipKnown: true,
  convertSimplified: true,
  fillPinyin: true,
}

export interface WordListContext {
  /** Characters of the cards already in the deck. */
  existingHanzi: ReadonlySet<string>
  knownHanzi: ReadonlySet<string>
  /** True when the text has Simplified-only characters. */
  isSimplified?: (text: string) => boolean
  /** Simplified → Traditional, once loaded. */
  toTraditional?: (text: string) => string
}

/** What a row needs a look at; the first four can keep it out of the import. */
export type RowIssue =
  | 'no-han'
  | 'duplicate-existing'
  | 'duplicate-file'
  | 'known'
  | 'simplified'
  | 'converted'
  | 'pinyin-filled'
  | 'no-pinyin'
  | 'pinyin-mismatch'
  | 'tone-differs'

export interface RowResult {
  /** Index into `table.rows`. */
  index: number
  draft: CardDraft
  issues: RowIssue[]
  /** Not imported (no characters, a repeat, or skipped by an option). */
  skipped: boolean
}

export interface WordListResult {
  rows: RowResult[]
  /** The cards to add, in file order. */
  drafts: CardDraft[]
  /** Rows per issue (skipped or not). */
  counts: Record<RowIssue, number>
}

// Dictionary look-ups are the slow part; changing a column or an option re-runs every row.
const MEMO_LIMIT = 50_000
function memo<T>(fn: (key: string) => T): (key: string) => T {
  const cache = new Map<string, T>()
  return (key) => {
    let v = cache.get(key)
    if (v === undefined) {
      if (cache.size > MEMO_LIMIT) cache.clear()
      v = fn(key)
      cache.set(key, v)
    }
    return v
  }
}
const suggest = memo(suggestPinyin)
const check = memo((key) => {
  const [hanzi, pinyin] = key.split('\t') as [string, string]
  return checkPinyin(hanzi, pinyin)
})

const lines = (text: string) => text.split('\n').filter(Boolean)

/** Cells of the columns with `role`, joined (notes and tags columns can be several). */
function pick(row: string[], roles: readonly ColumnRole[], role: ColumnRole, join = '\n'): string {
  return roles
    .flatMap((r, i) => (r === role && row[i] ? [row[i]] : []))
    .join(join)
    .trim()
}

const compactPinyin = (pinyin: string) => pinyin.toLowerCase().replace(/[^\p{L}\p{M}]/gu, '')

/**
 * Turn rows into card drafts in one pass. Rows without Han characters and repeats within the file
 * are skipped; words already in the deck and known words too when the options say so. Simplified
 * words are converted (when asked and the converter is loaded) or flagged; missing pinyin is filled
 * in from the dictionary when asked; pinyin that doesn't match the characters is flagged.
 */
export function buildDrafts(table: ParsedTable, roles: readonly ColumnRole[], options: WordListOptions, ctx: WordListContext): WordListResult {
  const counts = Object.fromEntries(
    (['no-han', 'duplicate-existing', 'duplicate-file', 'known', 'simplified', 'converted', 'pinyin-filled', 'no-pinyin', 'pinyin-mismatch', 'tone-differs'] as const).map((k) => [k, 0]),
  ) as Record<RowIssue, number>
  const seen = new Set<string>()
  const results: RowResult[] = []
  const drafts: CardDraft[] = []

  table.rows.forEach((row, index) => {
    const issues: RowIssue[] = []
    let hanzi = pick(row, roles, 'hanzi')
    let pinyin = pick(row, roles, 'pinyin')
    let meaning = pick(row, roles, 'meaning')
    const notes = [pick(row, roles, 'notes')]

    // Characters and pinyin in one cell (Quizlet terms, Anki fronts).
    const split = splitHanziPinyin(hanzi)
    if (split) {
      hanzi = split.hanzi
      pinyin ||= split.pinyin
    }
    // Pinyin and meaning in one cell, on separate lines (Anki backs).
    if (lines(pinyin).length > 1) {
      const [first, ...rest] = lines(pinyin)
      pinyin = first!
      if (meaning) notes.push(rest.join('\n'))
      else meaning = rest.join('\n')
    } else if (!pinyin && lines(meaning).length > 1 && looksLikePinyin(lines(meaning)[0]!)) {
      const [first, ...rest] = lines(meaning)
      pinyin = first!
      meaning = rest.join('\n')
    }
    meaning = lines(meaning).join('; ')
    hanzi = cleanHanzi(traditionalOf(cleanHanzi(hanzi), ctx.isSimplified))
    pinyin = normalizePinyin(pinyin)

    let exampleHanzi = lines(pick(row, roles, 'example', ' ')).join(' ')
    const toTraditional = options.convertSimplified ? ctx.toTraditional : undefined
    if (containsHan(hanzi) && ctx.isSimplified?.(hanzi)) {
      if (toTraditional) {
        hanzi = toTraditional(hanzi)
        issues.push('converted')
      } else issues.push('simplified')
    }
    if (toTraditional && exampleHanzi && ctx.isSimplified?.(exampleHanzi)) exampleHanzi = toTraditional(exampleHanzi)

    let skipped = false
    if (!containsHan(hanzi)) {
      issues.push('no-han')
      skipped = true
    } else {
      if (!pinyin) {
        if (options.fillPinyin) pinyin = suggest(hanzi)
        issues.push(pinyin ? 'pinyin-filled' : 'no-pinyin')
      }
      const key = `${hanzi}\t${compactPinyin(pinyin)}`
      if (ctx.existingHanzi.has(hanzi)) {
        issues.push('duplicate-existing')
        skipped ||= options.skipExisting
      } else if (seen.has(key)) {
        issues.push('duplicate-file')
        skipped = true
      }
      seen.add(key)
      if (ctx.knownHanzi.has(hanzi)) {
        issues.push('known')
        skipped ||= options.skipKnown
      }
      if (!skipped && !issues.includes('pinyin-filled') && pinyin) {
        const result = check(`${hanzi}\t${pinyin}`)
        if (result === 'mismatch') issues.push('pinyin-mismatch')
        else if (result === 'tone-differs') issues.push('tone-differs')
      }
    }

    const tagCells = pick(row, roles, 'tags', ' ')
    const tags = [...new Set([...table.fileTags, ...(table.rowTags[index] ?? []), ...tagCells.split(/[\s,;]+/)].filter(Boolean))]
    const draft: CardDraft = { hanzi, pinyin, tags }
    if (meaning) draft.meaning = meaning
    const note = notes.filter(Boolean).join('\n')
    if (note) draft.notes = note
    if (exampleHanzi) {
      draft.example = {
        hanzi: exampleHanzi,
        pinyin: normalizePinyin(pick(row, roles, 'examplePinyin', ' ')),
        meaning: lines(pick(row, roles, 'exampleMeaning')).join(' '),
      }
    }

    for (const issue of issues) counts[issue]++
    results.push({ index, draft, issues, skipped })
    if (!skipped) drafts.push(draft)
  })

  return { rows: results, drafts, counts }
}

/** The tag the user chose (spaces become `-`) in front of each draft's own tags. Kept out of {@link buildDrafts} so typing it re-runs nothing. */
export function withTag(drafts: readonly CardDraft[], tag: string): CardDraft[] {
  const t = tag.trim().replace(/\s+/g, '-')
  return t ? drafts.map((d) => ({ ...d, tags: [t, ...(d.tags ?? []).filter((x) => x !== t)] })) : [...drafts]
}
