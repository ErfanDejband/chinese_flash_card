import type { CardDraft } from '@/data/repositories/cards'
import { containsHan } from '@/domain/cjk'
import { GRAMMAR_TAG } from '@/domain/grammar'
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
  /** Whether a picture cell (workbook marker or file name) can be found; without it pictures aren't checked. */
  hasPicture?: (ref: string) => boolean
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
  /** The row names a picture file that wasn't chosen (the card is added without it). */
  | 'picture-missing'

/** A card draft from a word list, with the lesson its row names (when the list has a Lesson column). */
export interface ListDraft extends CardDraft {
  lesson?: string
  /** The picture cell: a workbook picture marker or an image file name (see pictures.ts). */
  picture?: string
}

export interface RowResult {
  /** Index into `table.rows`. */
  index: number
  draft: ListDraft
  issues: RowIssue[]
  /** Not imported (no characters, a repeat, or skipped by an option). */
  skipped: boolean
}

export interface WordListResult {
  rows: RowResult[]
  /** The cards to add, in file order. */
  drafts: ListDraft[]
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

/** A Lesson cell as a lesson title: a bare number `3` reads "Lesson 3". */
export function lessonTitle(cell: string): string {
  const t = cell.replace(/\s+/g, ' ').trim()
  return /^\d+$/.test(t) ? `Lesson ${Number(t)}` : t
}

/** A Type cell that says grammar (語法, 文法, 句型, pattern). Anything else is a word. */
export const isGrammarType = (cell: string) => /^(grammar|grammar point|g|pattern|sentence pattern|語法|语法|文法|句型)$/i.test(cell.trim())

/** The lessons the drafts name, in the order they first appear. */
export function lessonTitles(drafts: readonly ListDraft[]): string[] {
  return [...new Set(drafts.flatMap((d) => (d.lesson ? [d.lesson] : [])))]
}

/**
 * Turn rows into card drafts in one pass. Rows without Han characters and repeats within the file
 * are skipped; words already in the deck and known words too when the options say so. Simplified
 * words are converted (when asked and the converter is loaded) or flagged; missing pinyin is filled
 * in from the dictionary when asked; pinyin that doesn't match the characters is flagged.
 */
export function buildDrafts(table: ParsedTable, roles: readonly ColumnRole[], options: WordListOptions, ctx: WordListContext): WordListResult {
  const counts = Object.fromEntries(
    (['no-han', 'duplicate-existing', 'duplicate-file', 'known', 'simplified', 'converted', 'pinyin-filled', 'no-pinyin', 'pinyin-mismatch', 'tone-differs', 'picture-missing'] as const).map((k) => [k, 0]),
  ) as Record<RowIssue, number>
  const seen = new Set<string>()
  const results: RowResult[] = []
  const drafts: ListDraft[] = []
  const hasLessons = roles.includes('lesson')
  // An empty Lesson cell continues the lesson above (merged cells keep only the first value).
  let lesson = ''

  table.rows.forEach((row, index) => {
    const issues: RowIssue[] = []
    if (hasLessons) lesson = lessonTitle(pick(row, roles, 'lesson', ' ')) || lesson
    const grammar = isGrammarType(pick(row, roles, 'type'))
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
        // The detector also flags characters Taiwan writes the same way (床): only a real change counts.
        const converted = toTraditional(hanzi)
        if (converted !== hanzi) {
          hanzi = converted
          issues.push('converted')
        }
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
      if (ctx.knownHanzi.has(hanzi) && !grammar) {
        issues.push('known')
        skipped ||= options.skipKnown
      }
      // A grammar pattern (雖然…但是…) isn't a dictionary word: no reading check.
      if (!skipped && !grammar && !issues.includes('pinyin-filled') && pinyin) {
        const result = check(`${hanzi}\t${pinyin}`)
        if (result === 'mismatch') issues.push('pinyin-mismatch')
        else if (result === 'tone-differs') issues.push('tone-differs')
      }
    }

    const tagCells = pick(row, roles, 'tags', ' ')
    const tags = [...new Set([...table.fileTags, ...(table.rowTags[index] ?? []), ...tagCells.split(/[\s,;]+/), ...(grammar ? [GRAMMAR_TAG] : [])].filter(Boolean))]
    const draft: ListDraft = { hanzi, pinyin, tags }
    if (lesson) draft.lesson = lesson
    const picture = lines(pick(row, roles, 'image'))[0]
    if (picture) {
      draft.picture = picture
      if (ctx.hasPicture && !ctx.hasPicture(picture)) issues.push('picture-missing')
    }
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
export function withTag<T extends CardDraft>(drafts: readonly T[], tag: string): T[] {
  const t = tag.trim().replace(/\s+/g, '-')
  return t ? drafts.map((d) => ({ ...d, tags: [t, ...(d.tags ?? []).filter((x) => x !== t)] })) : [...drafts]
}
