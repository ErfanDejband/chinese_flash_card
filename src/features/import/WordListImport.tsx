import { useLiveQuery } from 'dexie-react-hooks'
import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { createCards, listActiveCards } from '@/data/repositories/cards'
import { knownHanziSet } from '@/data/repositories/knownWords'
import { loadSimplifiedDetector, loadToTraditional } from '@/import/extract/traditional'
import { assignRole, COLUMN_ROLES, guessRoles, type ColumnRole } from '@/import/table/columns'
import { decodeText, ENCODING_LABEL, type TextEncodingName } from '@/import/table/decode'
import { parseTable, tagFromFileName, type ParsedTable } from '@/import/table/formats'
import { buildDrafts, DEFAULT_WORD_LIST_OPTIONS, withTag, type RowIssue, type WordListOptions, type WordListResult } from '@/import/table/rows'
import { Button } from '@/ui/Button'
import { cn } from '@/ui/cn'
import { plural } from '@/ui/format'
import { Icon } from '@/ui/icons'
import { Loading } from '@/ui/Loading'
import { PageHeader } from '@/ui/PageHeader'
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

interface Sheet {
  file: File
  encoding: TextEncodingName
  table: ParsedTable
  roles: ColumnRole[]
}

type Opened = Sheet | { file: File; error: string }

async function readWordList(file: File): Promise<Opened> {
  if (file.size > MAX_BYTES) return { file, error: 'This file is too big for a word list (over 20 MB).' }
  try {
    const { text, encoding } = decodeText(new Uint8Array(await file.arrayBuffer()))
    const table = parseTable(text)
    if (!table.rows.length) return { file, error: 'No words found in this file.' }
    return { file, encoding, table, roles: guessRoles(table) }
  } catch {
    return { file, error: 'Could not read this file.' }
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

/**
 * `/import/list`: a word list exported by Anki, Pleco, Quizlet or a spreadsheet. Shows the guessed
 * column roles (changeable), a preview of the first cards and the counts; adds the cards in one go.
 */
export function WordListImport() {
  const navigate = useNavigate()
  // Back to Settings when the file came from "Restore from file" there.
  const back = (useLocation().state as { from?: unknown } | null)?.from === '/settings/sync' ? '/settings/sync' : '/import'
  const fileInput = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState(pendingWordListFile)
  const [opened, setOpened] = useState<Opened>()
  const [options, setOptions] = useState(DEFAULT_WORD_LIST_OPTIONS)
  const [tag, setTag] = useState(() => (file ? tagFromFileName(file.name) : ''))
  const [isSimplified, setIsSimplified] = useState<(text: string) => boolean>()
  const [converter, setConverter] = useState<{ convert?: (text: string) => string; failed?: boolean }>({})
  const [adding, setAdding] = useState(false)
  const [added, setAdded] = useState<number>()
  const [addError, setAddError] = useState<string>()
  const existing = useLiveQuery(async () => new Set((await listActiveCards()).map((c) => c.hanzi)), [])
  const known = useLiveQuery(() => knownHanziSet(), [])

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

  useEffect(() => {
    if (!file) return
    let active = true
    void readWordList(file).then((o) => active && setOpened(o))
    return () => {
      active = false
    }
  }, [file])

  const sheet = opened && opened.file === file && 'table' in opened ? opened : undefined
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

  function choose(next: File | undefined) {
    if (!next) return
    setFile(next)
    setTag(tagFromFileName(next.name))
    setOptions(DEFAULT_WORD_LIST_OPTIONS)
    setAdded(undefined)
    setAddError(undefined)
  }

  async function add() {
    if (!result || !result.drafts.length) return
    setAdding(true)
    setAddError(undefined)
    try {
      const cards = await createCards(
        withTag(result.drafts, tag).map((d) => ({ ...d, source: { type: 'manual' } as const })),
        Date.now(),
      )
      setAdded(cards.length)
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

  if (added !== undefined) {
    const query = tag.trim().replace(/\s+/g, '-')
    return (
      <>
        <PageHeader title="Word list imported" back={back} />
        <section className="rounded-3xl border border-line bg-surface p-5">
          <p className="text-lg font-semibold">Added {plural(added, 'card')}.</p>
          <p className="mt-1 text-muted">New cards wait in the new-card pool; a few are introduced each day.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={() => navigate(query ? `/cards?q=${encodeURIComponent(query)}` : '/cards', { replace: true })}>See them in Cards</Button>
            <Button variant="secondary" onClick={() => navigate('/', { replace: true })}>
              Home
            </Button>
          </div>
        </section>
      </>
    )
  }

  if (!file) {
    return (
      <>
        <PageHeader title="Import a word list" back={back} />
        <section className="rounded-3xl border border-line bg-surface p-5">
          <p className="mb-3 text-sm text-muted">Bring your words over from another app or a spreadsheet. No AI needed: the file is read on this device.</p>
          <ul className="mb-4 list-disc space-y-1 pl-5 text-sm">
            <li>Anki: “Notes in Plain Text” (.txt)</li>
            <li>Pleco: exported flashcards (.txt)</li>
            <li>Quizlet: the exported text, saved as a .txt file</li>
            <li>Excel, Numbers or Google Sheets: saved as CSV or tab-separated text</li>
          </ul>
          <Button size="lg" className="w-full" onClick={() => fileInput.current?.click()}>
            <Icon name="upload" /> Choose a file
          </Button>
          {picker}
        </section>
      </>
    )
  }

  if (opened?.file === file && 'error' in opened) {
    return (
      <>
        <PageHeader title="Import a word list" back={back} />
        <section className="rounded-3xl border border-line bg-surface p-5">
          <p className="font-semibold break-all">{file.name}</p>
          <p className="mt-1 text-sm text-red-600">{opened.error}</p>
          <Button variant="secondary" className="mt-4" onClick={() => fileInput.current?.click()}>
            Choose another file
          </Button>
          {picker}
        </section>
      </>
    )
  }

  if (!sheet || !result) {
    return (
      <>
        <PageHeader title="Import a word list" back={back} />
        <Loading label="Reading the file…" />
      </>
    )
  }

  const { table, roles } = sheet
  const count = result.drafts.length
  const converterLoading = needsConverter
  const setRole = (col: number, role: ColumnRole) => setOpened({ ...sheet, roles: assignRole(roles, col, role) })
  const option = (key: keyof WordListOptions, value: boolean) => setOptions((o) => ({ ...o, [key]: value }))

  return (
    <>
      <PageHeader title="Import a word list" back={back} />

      <section className="mb-4 flex items-start gap-3 rounded-3xl border border-line bg-surface p-4">
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{file.name}</p>
          <p className="text-sm text-muted">
            {table.label} · {plural(table.rows.length, 'row')}
            {sheet.encoding !== 'utf-8' && ` · read as ${ENCODING_LABEL[sheet.encoding]}`}
          </p>
        </div>
        <Button size="sm" variant="ghost" onClick={() => fileInput.current?.click()}>
          Change
        </Button>
        {picker}
      </section>

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
                <th className="w-[30%] px-3 py-2 font-medium">Pinyin</th>
                <th className="px-3 py-2 font-medium">Meaning</th>
              </tr>
            </thead>
            <tbody>
              {result.rows.slice(0, PREVIEW_ROWS).map((row) => (
                <Fragment key={row.index}>
                  <tr className={cn('border-t border-line', row.skipped && 'opacity-50')}>
                    <td className={cn('truncate px-3 pt-2 text-base', !row.issues.length && 'pb-2')} lang="zh-Hant">
                      {row.draft.hanzi || '—'}
                    </td>
                    <td className={cn('truncate px-3 pt-2', !row.issues.length && 'pb-2')}>{row.draft.pinyin}</td>
                    <td className={cn('truncate px-3 pt-2', !row.issues.length && 'pb-2')}>{row.draft.meaning}</td>
                  </tr>
                  {row.issues.length > 0 && (
                    <tr className={cn(row.skipped && 'opacity-50')}>
                      <td colSpan={3} className="px-3 pt-1 pb-2">
                        <div className="flex flex-wrap gap-1">
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
              ))}
            </tbody>
          </table>
        </div>
        {table.rows.length > PREVIEW_ROWS && <p className="mt-2 text-xs text-muted">The first {PREVIEW_ROWS} of {plural(table.rows.length, 'row')}.</p>}
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
            Find the cards later by searching for it in Cards.
            {table.format === 'pleco' && ' Pleco categories are added as tags too.'}
            {table.format === 'anki' && ' Anki tags are kept too.'}
          </span>
        </label>
      </section>

      <p className="mb-3 text-sm text-muted" aria-live="polite">
        {summary(result, options, table.rows.length)}
      </p>
      <Button size="lg" className="w-full" onClick={() => void add()} disabled={!count || adding || converterLoading}>
        {adding ? 'Adding…' : count ? `Add ${plural(count, 'card')}` : 'Nothing to add'}
      </Button>
      {addError && <p className="mt-3 text-sm text-red-600">{addError}</p>}
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
