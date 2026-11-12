import { useLiveQuery } from 'dexie-react-hooks'
import { Fragment, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router'
import { createCards, listActiveCards } from '@/data/repositories/cards'
import { createDeck, ensureLessons } from '@/data/repositories/decks'
import { knownHanziSet } from '@/data/repositories/knownWords'
import { GRAMMAR_TAG } from '@/domain/grammar'
import { MY_CARDS, titleKey } from '@/domain/library'
import { TargetSelect } from '@/features/decks/TargetSelect'
import { liveTarget, selectClass, targetFromParams, targetLabel, targetQuery, type Target } from '@/features/decks/target'
import { useDecks, useLessons } from '@/hooks/useDecks'
import { loadSimplifiedDetector, loadToTraditional } from '@/import/extract/traditional'
import { assignRole, COLUMN_ROLES, guessRoles, type ColumnRole } from '@/import/table/columns'
import { decodeText, ENCODING_LABEL, type TextEncodingName } from '@/import/table/decode'
import { parseTable, tagFromFileName, type ParsedTable } from '@/import/table/formats'
import { buildDrafts, DEFAULT_WORD_LIST_OPTIONS, lessonTitles, withTag, type RowIssue, type WordListOptions, type WordListResult } from '@/import/table/rows'
import { tableFromRows, tableFromSheets } from '@/import/table/sheets'
import { isXlsx, readXlsx, XlsxError, type Worksheet } from '@/import/table/xlsx'
import { Button } from '@/ui/Button'
import { cn } from '@/ui/cn'
import { plural } from '@/ui/format'
import { Icon } from '@/ui/icons'
import { Loading } from '@/ui/Loading'
import { PageHeader } from '@/ui/PageHeader'
import { Reading } from '@/ui/Reading'
import { TONE_CLASS } from './flags'
import { clearWordListFile, pendingWordListFile, WORD_LIST_ACCEPT } from './wordListFile'

const MAX_BYTES = 20 * 1024 * 1024
const PREVIEW_ROWS = 10

const ROLE_LABEL: Record<ColumnRole, string> = {
  hanzi: 'Characters',
  pinyin: 'Pinyin',
  meaning: 'Meaning',
  example: 'Example sentence',
  examplePinyin: 'Example pinyin',
  exampleMeaning: 'Example meaning',
  notes: 'Notes',
  tags: 'Tags',
  lesson: 'Lesson',
  type: 'Word or grammar',
  ignore: 'Don’t import',
}

const ISSUE_INFO: Record<RowIssue, { label: string; tone: keyof typeof TONE_CLASS }> = {
  'no-han': { label: 'no characters', tone: 'problem' },
  'duplicate-existing': { label: 'already in your cards', tone: 'check' },
  'duplicate-file': { label: 'repeated in the file', tone: 'check' },
  known: { label: 'you know this', tone: 'info' },
  simplified: { label: 'looks Simplified', tone: 'problem' },
  converted: { label: 'converted to Traditional', tone: 'info' },
  'pinyin-filled': { label: 'pinyin from the dictionary', tone: 'info' },
  'no-pinyin': { label: 'no pinyin', tone: 'check' },
  'pinyin-mismatch': { label: 'pinyin doesn’t match characters', tone: 'problem' },
  'tone-differs': { label: 'tone differs from dictionary', tone: 'info' },
}

/** Where the rows come from: a file, or text pasted from a spreadsheet. */
type Source = File | { pasted: string }

/** The rows being imported. An Excel file keeps its sheets: one is read, or all of them as lessons. */
interface Sheet {
  source: Source
  encoding?: TextEncodingName
  workbook?: Worksheet[]
  choice?: number | 'lessons'
  table: ParsedTable
  roles: ColumnRole[]
}

type Opened = Sheet | { source: Source; error: string }

const nameOf = (source: Source) => (source instanceof File ? source.name : 'Pasted rows')

function withTable(sheet: Omit<Sheet, 'table' | 'roles'>, table: ParsedTable): Opened {
  if (!table.rows.length) return { source: sheet.source, error: 'No words found.' }
  return { ...sheet, table, roles: guessRoles(table) }
}

const sheetTable = (workbook: Worksheet[], choice: number | 'lessons') => (choice === 'lessons' ? tableFromSheets(workbook) : tableFromRows(workbook[choice]!.rows))

/** `lessons`: an Excel file with several sheets becomes one lesson per sheet (else its first sheet is read). */
async function readWordList(source: Source, lessons: boolean): Promise<Opened> {
  if (!(source instanceof File)) return withTable({ source }, parseTable(source.pasted))
  if (source.size > MAX_BYTES) return { source, error: 'This file is too big for a word list (over 20 MB).' }
  try {
    const bytes = new Uint8Array(await source.arrayBuffer())
    if (isXlsx(bytes)) {
      const workbook = readXlsx(bytes).filter((s) => s.rows.length > 0)
      if (!workbook.length) return { source, error: 'No words found in this workbook.' }
      const choice = lessons && workbook.length > 1 ? 'lessons' : 0
      return withTable({ source, workbook, choice }, sheetTable(workbook, choice))
    }
    const { text, encoding } = decodeText(bytes)
    return withTable({ source, encoding }, parseTable(text))
  } catch (e) {
    return { source, error: e instanceof XlsxError ? e.message : 'Could not read this file.' }
  }
}

/** "312 words · 12 already in your deck (skipped) · 40 Simplified → converted · 3 rows without characters skipped". */
function summary(result: WordListResult, options: WordListOptions, rows: number): string {
  const c = result.counts
  const parts = [plural(rows - c['no-han'], 'word')]
  if (c['duplicate-existing']) parts.push(`${c['duplicate-existing']} already in your deck${options.skipExisting ? ' (skipped)' : ''}`)
  if (c['duplicate-file']) parts.push(`${c['duplicate-file']} repeated in the file (skipped)`)
  if (c.known) parts.push(`${plural(c.known, 'known word')}${options.skipKnown ? ' (skipped)' : ''}`)
  if (c.converted) parts.push(`${c.converted} Simplified → converted`)
  if (c.simplified) parts.push(`${c.simplified} look Simplified`)
  if (c['pinyin-filled']) parts.push(`${c['pinyin-filled']} pinyin filled in`)
  if (c['no-pinyin']) parts.push(`${c['no-pinyin']} without pinyin`)
  if (c['pinyin-mismatch']) parts.push(`${c['pinyin-mismatch']} with pinyin to check`)
  if (c['no-han']) parts.push(`${plural(c['no-han'], 'row')} without characters skipped`)
  return parts.join(' · ')
}

/** First non-empty cell of a column, on one line. */
function sampleOf(table: ParsedTable, col: number): string {
  return table.rows.find((r) => r[col])?.[col]?.replace(/\n/g, ' / ') ?? ''
}

const TEMPLATE = `${import.meta.env.BASE_URL}templates/class-template`

const HELP_COLUMNS: [string, string][] = [
  ['Characters', 'Required. The word, or a grammar pattern like 雖然…但是….'],
  ['Meaning', 'Recommended. What it means in your language.'],
  ['Pinyin', 'Optional: left empty, it is filled in from the dictionary. Type it where Taiwan reads a word differently.'],
  ['Lesson', 'Optional: rows with the same lesson go together. Leave a cell empty to stay in the lesson above; 3 means “Lesson 3”.'],
  ['Type', 'Optional: “grammar” for a grammar point; empty means a word.'],
  ['Example, Example pinyin, Example meaning', 'Optional: a sentence that uses it.'],
  ['Notes', 'Optional: measure word, part of speech, a hint.'],
]

/** How to lay out a file for import, with the templates. */
function FileHelp({ open = false }: { open?: boolean }) {
  return (
    <details open={open} className="group rounded-2xl border border-line bg-surface px-4 py-3 text-sm">
      <summary className="cursor-pointer font-semibold">How to set up your file</summary>
      <p className="mt-2 text-muted">
        One row per card and the column names in the first row, in any order. Excel (.xlsx), Google Sheets (File → Download → .xlsx or .csv),
        Numbers and CSV files all work, or copy the rows and paste them.
      </p>
      <dl className="mt-3 grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-[11rem_1fr]">
        {HELP_COLUMNS.map(([name, text]) => (
          <Fragment key={name}>
            <dt className="font-medium">{name}</dt>
            <dd className="text-muted">{text}</dd>
          </Fragment>
        ))}
      </dl>
      <p className="mt-3 text-muted">A workbook with one sheet per lesson works too: the sheet names become the lessons.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <a href={`${TEMPLATE}.xlsx`} download="class-template.xlsx" className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-line px-3 font-semibold hover:bg-sunken">
          <Icon name="download" className="size-4" /> Excel template
        </a>
        <a href={`${TEMPLATE}.csv`} download="class-template.csv" className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-line px-3 font-semibold hover:bg-sunken">
          <Icon name="download" className="size-4" /> CSV template
        </a>
      </div>
    </details>
  )
}

interface Added {
  count: number
  target: Target
  label: string
  lessons: number
  tag: string
}

/**
 * `/import/list`: a word list exported by Anki, Pleco, Quizlet or a spreadsheet, an Excel workbook,
 * or rows pasted from a spreadsheet (`?paste=1`). Shows the guessed column roles (changeable), a
 * preview of the first cards and the counts; adds the cards in one go to My cards or a deck, where
 * a Lesson column (or one sheet per lesson) makes the lessons.
 */
export function WordListImport() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const pasting = params.get('paste') === '1'
  const fromSettings = (useLocation().state as { from?: unknown } | null)?.from === '/settings/sync'
  const decks = useDecks()
  const lessons = useLessons()
  const chosen = targetFromParams(params)
  const target = decks && lessons ? liveTarget(chosen, decks, lessons) : chosen
  const query = targetQuery(target)
  // Back to Settings when the file came from "Restore from file" there.
  const back = fromSettings ? '/settings/sync' : query ? `/import?${query}` : '/import'
  const fileInput = useRef<HTMLInputElement>(null)
  const [source, setSource] = useState<Source | undefined>(pendingWordListFile)
  const [pasted, setPasted] = useState('')
  const [opened, setOpened] = useState<Opened>()
  const [options, setOptions] = useState(DEFAULT_WORD_LIST_OPTIONS)
  const [tag, setTag] = useState(() => (source instanceof File && chosen.deckId === MY_CARDS ? tagFromFileName(source.name) : ''))
  /** The name of a deck to make for these cards. */
  const [newDeck, setNewDeck] = useState<string>()
  const [isSimplified, setIsSimplified] = useState<(text: string) => boolean>()
  const [converter, setConverter] = useState<{ convert?: (text: string) => string; failed?: boolean }>({})
  const [adding, setAdding] = useState(false)
  const [added, setAdded] = useState<Added>()
  const [addError, setAddError] = useState<string>()
  const existing = useLiveQuery(async () => new Set((await listActiveCards()).map((c) => c.hanzi)), [])
  const known = useLiveQuery(() => knownHanziSet(), [])
  const toDeck = newDeck !== undefined || target.deckId !== MY_CARDS

  // The file handed over by the import page or Settings is ours now.
  useEffect(() => clearWordListFile, [])

  useEffect(() => {
    let active = true
    loadSimplifiedDetector().then(
      (detect) => active && setIsSimplified(() => detect),
      () => undefined, // No detection: words are added as they are.
    )
    return () => {
      active = false
    }
  }, [])

  // Read once per source: a workbook's sheets become lessons when the cards go into a deck.
  const read = useEffectEvent((s: Source) => readWordList(s, toDeck))
  useEffect(() => {
    if (!source) return
    let active = true
    void read(source).then((o) => active && setOpened(o))
    return () => {
      active = false
    }
  }, [source])

  const sheet = opened && opened.source === source && 'table' in opened ? opened : undefined
  const result = useMemo(
    () =>
      sheet && existing && known
        ? buildDrafts(sheet.table, sheet.roles, options, { existingHanzi: existing, knownHanzi: known, isSimplified, toTraditional: converter.convert })
        : undefined,
    [sheet, existing, known, isSimplified, converter.convert, options],
  )

  const simplifiedFound = Boolean(result && result.counts.simplified + result.counts.converted > 0)
  const needsConverter = simplifiedFound && options.convertSimplified && !converter.convert && !converter.failed
  useEffect(() => {
    if (!needsConverter) return
    let active = true
    loadToTraditional().then(
      (convert) => active && setConverter({ convert }),
      () => active && setConverter({ failed: true }),
    )
    return () => {
      active = false
    }
  }, [needsConverter])

  function choose(next: Source | undefined) {
    if (!next) return
    setSource(next)
    setTag(next instanceof File && !toDeck ? tagFromFileName(next.name) : '')
    setOptions(DEFAULT_WORD_LIST_OPTIONS)
    setAdded(undefined)
    setAddError(undefined)
  }

  function setTarget(t: Target) {
    setNewDeck(undefined)
    const next = new URLSearchParams(targetQuery(t))
    if (pasting) next.set('paste', '1')
    setParams(next, { replace: true })
  }

  async function add() {
    if (!result || !result.drafts.length || !decks || !lessons) return
    setAdding(true)
    setAddError(undefined)
    try {
      const deckId = newDeck !== undefined ? (await createDeck(newDeck)).id : target.deckId
      const lessonId = newDeck !== undefined ? undefined : target.lessonId
      const titles = deckId !== MY_CARDS ? lessonTitles(result.drafts) : []
      const made = titles.length ? await ensureLessons(deckId, titles) : new Map()
      const cards = await createCards(
        withTag(result.drafts, tag).map(({ lesson, ...d }) => ({
          ...d,
          source: { type: 'manual' } as const,
          deckId,
          lessonId: (lesson && made.get(titleKey(lesson))?.id) || lessonId,
        })),
        Date.now(),
      )
      const where: Target = titles.length > 1 || !lessonId ? { deckId } : { deckId, lessonId }
      setAdded({ count: cards.length, target: where, label: newDeck?.trim() || targetLabel(where, decks, lessons), lessons: titles.length, tag: tag.trim().replace(/\s+/g, '-') })
    } catch (e) {
      setAddError(e instanceof Error ? e.message : 'Could not add the cards.')
    } finally {
      setAdding(false)
    }
  }

  const picker = (
    <input
      ref={fileInput}
      type="file"
      accept={WORD_LIST_ACCEPT}
      hidden
      onChange={(e) => {
        choose(e.target.files?.[0])
        e.target.value = ''
      }}
    />
  )
  const title = pasting && !(source instanceof File) ? 'Paste from a spreadsheet' : 'Import a word list'

  if (added) {
    const inDeck = added.target.deckId !== MY_CARDS
    const deckPage = added.target.lessonId ? `/decks/${added.target.deckId}/${added.target.lessonId}` : `/decks/${added.target.deckId}`
    return (
      <>
        <PageHeader title="Cards added" back={back} />
        <section className="rounded-3xl border border-line bg-surface p-5">
          <p className="text-lg font-semibold">
            Added {plural(added.count, 'card')}
            {inDeck && ` to ${added.label}`}
            {added.lessons > 1 && ` in ${plural(added.lessons, 'lesson')}`}.
          </p>
          <p className="mt-1 text-muted">New cards wait in the new-card pool; a few are introduced each day.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {inDeck ? (
              <Button onClick={() => navigate(deckPage, { replace: true })}>Open {added.target.lessonId ? 'the lesson' : 'the deck'}</Button>
            ) : (
              <Button onClick={() => navigate(added.tag ? `/cards?q=${encodeURIComponent(added.tag)}` : '/cards', { replace: true })}>See them in Your cards</Button>
            )}
            <Button variant="secondary" onClick={() => navigate('/', { replace: true })}>
              Home
            </Button>
          </div>
        </section>
      </>
    )
  }

  if (!source) {
    return (
      <>
        <PageHeader title={title} back={back} />
        {pasting ? (
          <section className="mb-4 rounded-3xl border border-line bg-surface p-5">
            <p className="mb-3 text-sm text-muted">
              In Excel, Google Sheets or Numbers, select the rows (with the column names on top) and copy them, then paste here. No AI needed: everything stays on
              this device.
            </p>
            <textarea
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
              rows={8}
              lang="zh-Hant"
              aria-label="Pasted rows"
              placeholder={'Lesson\tCharacters\tPinyin\tMeaning\n1\t餐廳\tcāntīng\trestaurant\n1\t菜單\tcàidān\tmenu'}
              className="w-full rounded-xl border border-line bg-paper px-3 py-2 font-mono text-sm outline-none focus:border-accent"
            />
            <Button size="lg" className="mt-3 w-full" disabled={!pasted.trim()} onClick={() => choose({ pasted })}>
              Read the rows
            </Button>
            <p className="mt-3 text-sm">
              <button type="button" className="font-semibold text-accent" onClick={() => fileInput.current?.click()}>
                Or choose a file →
              </button>
            </p>
            {picker}
          </section>
        ) : (
          <section className="mb-4 rounded-3xl border border-line bg-surface p-5">
            <p className="mb-3 text-sm text-muted">Bring your words over from a spreadsheet or another app. No AI needed: the file is read on this device.</p>
            <ul className="mb-4 list-disc space-y-1 pl-5 text-sm">
              <li>Excel (.xlsx), or a CSV or tab-separated file from any spreadsheet</li>
              <li>Anki: “Notes in Plain Text” (.txt)</li>
              <li>Pleco: exported flashcards (.txt)</li>
              <li>Quizlet: the exported text, saved as a .txt file</li>
            </ul>
            <Button size="lg" className="w-full" onClick={() => fileInput.current?.click()}>
              <Icon name="upload" /> Choose a file
            </Button>
            <p className="mt-3 text-sm">
              <Link to={query ? `/import/list?paste=1&${query}` : '/import/list?paste=1'} replace className="font-semibold text-accent">
                Or paste rows from a spreadsheet →
              </Link>
            </p>
            {picker}
          </section>
        )}
        <FileHelp open={pasting} />
      </>
    )
  }

  if (opened?.source === source && 'error' in opened) {
    return (
      <>
        <PageHeader title={title} back={back} />
        <section className="mb-4 rounded-3xl border border-line bg-surface p-5">
          <p className="font-semibold break-all">{nameOf(source)}</p>
          <p className="mt-1 text-sm text-red-600 dark:text-red-400">{opened.error}</p>
          <Button variant="secondary" className="mt-4" onClick={() => (source instanceof File ? fileInput.current?.click() : setSource(undefined))}>
            {source instanceof File ? 'Choose another file' : 'Paste again'}
          </Button>
          {picker}
        </section>
        <FileHelp open />
      </>
    )
  }

  if (!sheet || !result || !decks || !lessons) {
    return (
      <>
        <PageHeader title={title} back={back} />
        <Loading label="Reading the rows…" />
      </>
    )
  }

  const { table, roles } = sheet
  const count = result.drafts.length
  const converterLoading = needsConverter
  const setRole = (col: number, role: ColumnRole) => setOpened({ ...sheet, roles: assignRole(roles, col, role) })
  const option = (key: keyof WordListOptions, value: boolean) => setOptions((o) => ({ ...o, [key]: value }))
  const lessonNames = lessonTitles(result.drafts)
  const fileLessons = roles.includes('lesson') && lessonNames.length > 0

  function chooseSheet(value: string) {
    if (!sheet?.workbook) return
    const choice = value === 'lessons' ? 'lessons' : Number(value)
    setOpened(withTable({ source: sheet.source, workbook: sheet.workbook, choice }, sheetTable(sheet.workbook, choice)))
  }

  return (
    <>
      <PageHeader title={title} back={back} />

      <section className="mb-4 flex items-start gap-3 rounded-3xl border border-line bg-surface p-4">
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{nameOf(source)}</p>
          <p className="text-sm text-muted">
            {table.label} · {plural(table.rows.length, 'row')}
            {sheet.encoding && sheet.encoding !== 'utf-8' && ` · read as ${ENCODING_LABEL[sheet.encoding]}`}
          </p>
        </div>
        <Button size="sm" variant="ghost" onClick={() => (source instanceof File ? fileInput.current?.click() : setSource(undefined))}>
          Change
        </Button>
        {picker}
      </section>

      {sheet.workbook && sheet.workbook.length > 1 && (
        <label className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-3xl border border-line bg-surface p-4">
          <span className="font-medium">Sheets</span>
          <select value={String(sheet.choice)} onChange={(e) => chooseSheet(e.target.value)} className={cn(selectClass, 'flex-1 basis-56')}>
            <option value="lessons">All {sheet.workbook.length} sheets, one lesson each</option>
            {sheet.workbook.map((s, i) => (
              <option key={i} value={i}>
                Only “{s.name}”
              </option>
            ))}
          </select>
        </label>
      )}

      <section className="mb-4 rounded-3xl border border-line bg-surface p-4">
        <h2 className="mb-1 text-lg font-semibold">Columns</h2>
        <p className="mb-3 text-sm text-muted">What each column holds. Change any that were guessed wrong.</p>
        <ul className="flex flex-col gap-2">
          {table.columns.map((name, col) => (
            <li key={col} className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{name || `Column ${col + 1}`}</div>
                <div className="truncate text-xs text-muted" lang="zh-Hant">
                  {sampleOf(table, col) || '(empty)'}
                </div>
              </div>
              <select
                className="h-10 w-40 shrink-0 rounded-xl border border-line bg-paper px-2 text-sm outline-none focus:border-accent"
                value={roles[col]}
                onChange={(e) => setRole(col, e.target.value as ColumnRole)}
                aria-label={`What ${name || `column ${col + 1}`} holds`}
              >
                {COLUMN_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </option>
                ))}
              </select>
            </li>
          ))}
        </ul>
        {!roles.includes('hanzi') && (
          <p className="mt-3 rounded-xl bg-amber-100 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
            Choose the column with the Chinese characters.
          </p>
        )}
      </section>

      <section className="mb-4 rounded-3xl border border-line bg-surface p-4">
        <h2 className="mb-3 text-lg font-semibold">Preview</h2>
        <div className="overflow-hidden rounded-2xl border border-line">
          <table className="w-full table-fixed text-left text-sm">
            <thead className="bg-sunken text-xs text-muted">
              <tr>
                <th className="w-[30%] px-3 py-2 font-medium">Characters</th>
                <th className="w-[30%] px-3 py-2 font-medium">Reading</th>
                <th className="px-3 py-2 font-medium">Meaning</th>
              </tr>
            </thead>
            <tbody>
              {result.rows.slice(0, PREVIEW_ROWS).map((row) => {
                const grammar = row.draft.tags?.includes(GRAMMAR_TAG)
                const chips = row.issues.length > 0 || !!row.draft.lesson || grammar
                return (
                  <Fragment key={row.index}>
                    <tr className={cn('border-t border-line', row.skipped && 'opacity-50')}>
                      <td className={cn('truncate px-3 pt-2 text-base', !chips && 'pb-2')} lang="zh-Hant">
                        {row.draft.hanzi || '—'}
                      </td>
                      <td className={cn('truncate px-3 pt-2', !chips && 'pb-2')}>
                        <Reading pinyin={row.draft.pinyin} hanzi={row.draft.hanzi} />
                      </td>
                      <td className={cn('truncate px-3 pt-2', !chips && 'pb-2')}>{row.draft.meaning}</td>
                    </tr>
                    {chips && (
                      <tr className={cn(row.skipped && 'opacity-50')}>
                        <td colSpan={3} className="px-3 pt-1 pb-2">
                          <div className="flex flex-wrap gap-1">
                            {row.draft.lesson && <span className="rounded-full bg-sunken px-2 py-0.5 text-[11px] font-medium text-muted">{row.draft.lesson}</span>}
                            {grammar && <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-medium text-violet-700 dark:bg-violet-950 dark:text-violet-300">grammar</span>}
                            {row.skipped && <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', TONE_CLASS.info)}>skipped</span>}
                            {row.issues.map((issue) => (
                              <span key={issue} className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', TONE_CLASS[ISSUE_INFO[issue].tone])}>
                                {ISSUE_INFO[issue].label}
                              </span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
        {table.rows.length > PREVIEW_ROWS && <p className="mt-2 text-xs text-muted">The first {PREVIEW_ROWS} of {plural(table.rows.length, 'row')}.</p>}
      </section>

      <section className="mb-4 flex flex-col gap-3 rounded-3xl border border-line bg-surface p-4">
        <h2 className="text-lg font-semibold">Where they go</h2>
        <div className="flex flex-wrap items-center gap-2">
          {newDeck !== undefined ? (
            <>
              <input
                value={newDeck}
                onChange={(e) => setNewDeck(e.target.value)}
                placeholder="New deck name"
                aria-label="New deck name"
                autoFocus
                className={cn(selectClass, 'flex-1 basis-56')}
              />
              <Button size="sm" variant="ghost" onClick={() => setNewDeck(undefined)}>
                Cancel
              </Button>
            </>
          ) : (
            <TargetSelect
              value={target}
              onChange={setTarget}
              decks={decks}
              lessons={lessons}
              onNewDeck={() => setNewDeck(source instanceof File ? source.name.replace(/\.[^.]*$/, '') : '')}
              className="flex-1 basis-56"
            />
          )}
        </div>
        {fileLessons &&
          (toDeck ? (
            <p className="text-sm text-muted">
              The Lesson {sheet.choice === 'lessons' ? 'sheets make' : 'column makes'} {plural(lessonNames.length, 'lesson')}: {lessonNames.slice(0, 6).join(', ')}
              {lessonNames.length > 6 && ', …'}. Lessons the deck already has are reused.
            </p>
          ) : (
            <p className="rounded-xl bg-amber-100 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
              The file has {plural(lessonNames.length, 'lesson')}. Choose a deck (or a new one) to keep them; in My cards there are no lessons.
            </p>
          ))}
      </section>

      <section className="mb-4 flex flex-col gap-3 rounded-3xl border border-line bg-surface p-4">
        <h2 className="text-lg font-semibold">Options</h2>
        <Check checked={options.skipExisting} onChange={(v) => option('skipExisting', v)} label="Skip words already in my deck" />
        <Check checked={options.skipKnown} onChange={(v) => option('skipKnown', v)} label="Skip words I marked as known" />
        {simplifiedFound && (
          <Check
            checked={options.convertSimplified && !converter.failed}
            disabled={converter.failed}
            onChange={(v) => option('convertSimplified', v)}
            label="Convert Simplified to Traditional"
            hint={
              converter.failed
                ? 'The converter couldn’t be loaded (it needs a connection the first time). The words are added as they are.'
                : converterLoading
                  ? 'Loading the converter…'
                  : 'Some words are in Simplified characters. Unticked, they are added as they are.'
            }
          />
        )}
        <Check
          checked={options.fillPinyin}
          onChange={(v) => option('fillPinyin', v)}
          label="Fill in missing pinyin"
          hint="From the app’s dictionary; worth a check for words with several readings."
        />
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium">Tag for the new cards</span>
          <input
            className="h-11 w-full rounded-xl border border-line bg-paper px-3 outline-none focus:border-accent"
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            placeholder="No tag"
            autoComplete="off"
            spellCheck={false}
          />
          <span className="text-muted">
            Optional. Find the cards later by searching for it in Your cards (Settings).
            {table.format === 'pleco' && ' Pleco categories are added as tags too.'}
            {table.format === 'anki' && ' Anki tags are kept too.'}
          </span>
        </label>
      </section>

      <p className="mb-3 text-sm text-muted" aria-live="polite">
        {summary(result, options, table.rows.length)}
      </p>
      <Button size="lg" className="w-full" onClick={() => void add()} disabled={!count || adding || converterLoading || (newDeck !== undefined && !newDeck.trim())}>
        {adding ? 'Adding…' : count ? `Add ${plural(count, 'card')}` : 'Nothing to add'}
      </Button>
      {addError && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{addError}</p>}
      <div className="mt-6">
        <FileHelp />
      </div>
    </>
  )
}

function Check({
  checked,
  disabled,
  onChange,
  label,
  hint,
}: {
  checked: boolean
  disabled?: boolean
  onChange: (value: boolean) => void
  label: string
  hint?: string
}) {
  return (
    <label className={cn('flex items-start gap-3 text-sm', disabled && 'opacity-60')}>
      <input type="checkbox" className="mt-0.5 size-4 shrink-0" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>
        <span className="font-medium">{label}</span>
        {hint && <span className="block text-muted">{hint}</span>}
      </span>
    </label>
  )
}
