import { containsHan } from '@/domain/cjk'
import { checkPinyin } from '@/domain/pinyin/suggest'
import { looksLikePinyin } from '@/domain/pinyin/tones'
import type { ParsedTable } from './formats'

/** What a column of a word list holds. */
export type ColumnRole = 'hanzi' | 'pinyin' | 'meaning' | 'example' | 'examplePinyin' | 'exampleMeaning' | 'notes' | 'tags' | 'ignore'

export const COLUMN_ROLES: readonly ColumnRole[] = ['hanzi', 'pinyin', 'meaning', 'example', 'examplePinyin', 'exampleMeaning', 'notes', 'tags', 'ignore']

/** Roles only one column can have; notes and tags columns are joined. */
export const SINGLE_ROLES: ReadonlySet<ColumnRole> = new Set(['hanzi', 'pinyin', 'meaning', 'example', 'examplePinyin', 'exampleMeaning'])

export interface NamedRole {
  role: ColumnRole
  /**
   * How sure the name is: 3 = Traditional characters, 2 = clear, 1 = Simplified characters (a
   * Traditional column wins), 0 = generic (Front, Back, Word): used only when the content agrees.
   */
  rank: number
}

const EXACT: [ColumnRole, number, string[]][] = [
  ['hanzi', 3, ['traditional', 'traditional chinese', 'trad', '繁體', '繁体', '繁體字', '繁體中文', '正體', '正體字']],
  [
    'hanzi',
    2,
    ['hanzi', 'chinese', 'characters', 'character', 'chars', 'vocab', 'vocabulary', 'headword', 'expression', 'chinese word', '漢字', '汉字', '中文', '生詞', '生词', '詞', '词', '詞語', '词语', '單詞', '单词', '單字', '单字', '生字', '字詞', '字词', '詞彙', '词汇', '字'],
  ],
  ['hanzi', 1, ['simplified', 'simplified chinese', 'simp', '簡體', '简体', '簡體字', '简体字']],
  ['hanzi', 0, ['word', 'front', 'term', 'question']],
  ['pinyin', 2, ['pinyin', 'reading', 'pronunciation', '拼音', '發音', '发音', '讀音', '读音']],
  [
    'meaning',
    2,
    ['meaning', 'meanings', 'english', 'translation', 'definition', 'definitions', 'gloss', '意思', '英文', '翻譯', '翻译', '解釋', '解释', '意義', '意义', '釋義', '释义', '詞義', '词义', '定義', '定义'],
  ],
  ['meaning', 0, ['back', 'answer']],
  ['example', 2, ['example', 'examples', 'example sentence', 'sentence', 'sentences', '例句', '句子']],
  ['examplePinyin', 2, ['example pinyin', 'sentence pinyin', 'example reading', '例句拼音']],
  ['exampleMeaning', 2, ['example meaning', 'example translation', 'example english', 'sentence meaning', 'sentence translation', '例句意思', '例句翻譯', '例句翻译', '例句英文']],
  ['tags', 2, ['tags', 'tag', 'labels', '標籤', '标签']],
  ['notes', 2, ['notes', 'note', 'remarks', 'comment', 'comments', 'part of speech', 'pos', 'measure word', '備註', '备注', '筆記', '笔记', '詞性', '词性', '量詞', '量词']],
  ['ignore', 2, ['guid', 'id', 'notetype', 'note type', 'deck', 'audio', 'sound', 'image', 'picture', 'zhuyin', 'bopomofo', '注音', '序號', '编号']],
]

const BY_NAME = new Map(EXACT.flatMap(([role, rank, names]) => names.map((name) => [name, { role, rank }] as const)))

/** Looser matches for names like "English meaning" or "Pinyin (with tones)", checked in order. */
const CONTAINS: [ColumnRole, RegExp][] = [
  ['examplePinyin', /(example|sentence|例句).*(pinyin|拼音)|(pinyin|拼音).*(example|sentence|例句)/],
  ['exampleMeaning', /(example|sentence|例句).*(meaning|english|translation|意思|翻|英文)|(meaning|english|translation).*(example|sentence)/],
  ['example', /example|sentence|例句/],
  ['pinyin', /pinyin|拼音/],
  ['tags', /\btags?\b|標籤|标签/],
  ['notes', /\bnotes?\b|備註|备注/],
  ['meaning', /english|meaning|translation|definition|意思|英文|翻譯|翻译/],
  ['hanzi', /chinese|hanzi|character|traditional|漢字|汉字|中文|繁/],
]

const normName = (name: string) =>
  name
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s_\-./:()（）[\]#*]+/g, ' ')
    .trim()

/** The role a column name stands for, if it is a name the app knows. */
export function roleFromName(name: string): NamedRole | undefined {
  const n = normName(name)
  if (!n) return undefined
  const exact = BY_NAME.get(n)
  if (exact) return exact
  // Long cells are data, not column names.
  if (n.length > 30) return undefined
  const loose = CONTAINS.find(([, re]) => re.test(n))
  if (!loose) return undefined
  const rank = loose[0] !== 'hanzi' ? 2 : /traditional|繁/.test(n) ? 3 : /simplified|简|簡/.test(n) ? 1 : 2
  return { role: loose[0], rank }
}

interface ColumnStats {
  /** Share of rows with something in this column. */
  filled: number
  /** Shares of the non-empty cells: with Han characters, pinyin-like, words (lowercase letters) without Han, only digits. */
  han: number
  pinyin: number
  words: number
  numeric: number
  /** Han characters per non-empty cell. */
  avgHan: number
}

const SAMPLE_ROWS = 300
const HAN_G = /\p{Script=Han}/gu
const WORDS = /\p{Ll}{2}/u

function columnStats(rows: string[][], col: number): ColumnStats {
  let filled = 0
  let han = 0
  let pinyin = 0
  let words = 0
  let numeric = 0
  let hanChars = 0
  for (const row of rows) {
    const cell = row[col] ?? ''
    if (!cell) continue
    filled++
    const hanCount = cell.match(HAN_G)?.length ?? 0
    if (hanCount) {
      han++
      hanChars += hanCount
    } else if (WORDS.test(cell)) words++
    if (looksLikePinyin(cell)) pinyin++
    if (/^[\d\s.,:-]+$/.test(cell)) numeric++
  }
  const share = (n: number) => (filled ? n / filled : 0)
  return {
    filled: rows.length ? filled / rows.length : 0,
    han: share(han),
    pinyin: share(pinyin),
    words: share(words),
    numeric: share(numeric),
    avgHan: share(hanChars),
  }
}

/**
 * Share of a column's cells that read like the pinyin of the characters in column `hanziCol`
 * (also without tone marks). The first run of Han characters stands for the word (`你们[你們]`).
 */
function readsAs(rows: string[][], col: number, hanziCol: number): number {
  let tried = 0
  let fits = 0
  for (const row of rows.slice(0, 40)) {
    const cell = row[col]?.split('\n')[0]
    const hanzi = row[hanziCol]?.match(/\p{Script=Han}+/u)?.[0]
    if (!cell || !hanzi || containsHan(cell)) continue
    tried++
    const check = checkPinyin(hanzi, cell)
    if (check === 'match' || check === 'tone-differs') fits++
  }
  return tried ? fits / tried : 0
}

/**
 * A role for every column: the file's own (Anki's `#tags column:`…), then column names, then the
 * content: the column with Han characters (shortest, leftmost) holds the characters, a longer
 * one the example; the reading of the characters (else pinyin-like text) is the pinyin, a second
 * such column the example's; the first column of words (lowercase letters) is the meaning, one after
 * the example its translation; number columns are ignored and anything else is a note.
 */
export function guessRoles(table: ParsedTable): ColumnRole[] {
  const n = table.columns.length
  const sample = table.rows.slice(0, SAMPLE_ROWS)
  const stats = Array.from({ length: n }, (_, i) => columnStats(sample, i))
  const roles: (ColumnRole | undefined)[] = Array.from({ length: n }, (_, i) => table.fixedRoles[i] ?? (stats[i]!.filled === 0 ? 'ignore' : undefined))
  const taken = (role: ColumnRole) => roles.includes(role)
  const free = () => roles.flatMap((r, i) => (r === undefined ? [i] : []))

  // Names. For single roles the highest rank (then the leftmost) wins; generic names wait for the content check.
  const named = table.columns.map((name, i) => (roles[i] === undefined ? roleFromName(name) : undefined))
  for (const role of COLUMN_ROLES) {
    const candidates = named.flatMap((m, i) => (m?.role === role && m.rank > 0 ? [{ i, rank: m.rank }] : []))
    if (!candidates.length) continue
    if (!SINGLE_ROLES.has(role)) {
      for (const c of candidates) roles[c.i] = role
      continue
    }
    const best = candidates.reduce((a, b) => (b.rank > a.rank ? b : a))
    roles[best.i] = role
    for (const c of candidates) if (c !== best) roles[c.i] = c.rank === 1 ? 'ignore' : 'notes'
  }
  named.forEach((m, i) => {
    if (m?.rank !== 0 || roles[i] !== undefined || taken(m.role)) return
    const hanHeavy = stats[i]!.han >= 0.5
    if ((m.role === 'hanzi') === hanHeavy) roles[i] = m.role
  })

  // Content: characters and example.
  if (!taken('hanzi')) {
    const cands = free().filter((i) => stats[i]!.han >= 0.5)
    if (cands.length) {
      const shortest = Math.min(...cands.map((i) => stats[i]!.avgHan))
      roles[cands.find((i) => stats[i]!.avgHan <= shortest * 2 + 0.5)!] = 'hanzi'
    }
  }
  const hanziCol = roles.indexOf('hanzi')
  if (!taken('example') && hanziCol >= 0) {
    const longer = free().find((i) => stats[i]!.han >= 0.5 && stats[i]!.avgHan >= Math.max(4, stats[hanziCol]!.avgHan * 2))
    if (longer !== undefined) roles[longer] = 'example'
  }

  // Pinyin: the reading of the characters (even without tone marks), else pinyin-like text.
  const best = (score: (i: number) => number) => {
    const scored = free()
      .filter((i) => stats[i]!.han < 0.5)
      .map((i) => ({ i, s: score(i) }))
      .filter((c) => c.s >= 0.5)
    return scored.length ? scored.reduce((a, b) => (b.s > a.s ? b : a)).i : undefined
  }
  if (!taken('pinyin')) {
    const col = (hanziCol >= 0 ? best((i) => readsAs(sample, i, hanziCol)) : undefined) ?? best((i) => stats[i]!.pinyin)
    if (col !== undefined) roles[col] = 'pinyin'
  }
  const exampleCol = roles.indexOf('example')
  if (!taken('examplePinyin') && exampleCol >= 0) {
    const col = best((i) => Math.max(stats[i]!.pinyin, readsAs(sample, i, exampleCol)))
    if (col !== undefined) roles[col] = 'examplePinyin'
  }

  // Meaning: words; a second such column after the example is its translation.
  const wordCols = free().filter((i) => stats[i]!.words >= 0.5)
  if (!taken('meaning') && wordCols.length) roles[wordCols.shift()!] = 'meaning'
  if (!taken('exampleMeaning') && exampleCol >= 0) {
    const after = wordCols.find((i) => i > exampleCol)
    if (after !== undefined) roles[after] = 'exampleMeaning'
  }

  return roles.map((r, i) => r ?? (stats[i]!.numeric >= 0.9 ? 'ignore' : 'notes'))
}

/** Give a column a role; a single role moves away from the column that had it (that one is then ignored). */
export function assignRole(roles: readonly ColumnRole[], index: number, role: ColumnRole): ColumnRole[] {
  return roles.map((r, i) => (i === index ? role : SINGLE_ROLES.has(role) && r === role ? 'ignore' : r))
}
