import { useLiveQuery } from 'dexie-react-hooks'
import { useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { createImport, discardImport, findImportsByHash, listOpenImports } from '@/data/repositories/imports'
import { configProblems } from '@/import/ai/createProvider'
import { serviceFor } from '@/import/ai/detectKey'
import { createDemoProvider, DEMO_MODEL } from '@/import/demo/demoProvider'
import { createSamplePage } from '@/import/demo/samplePage'
import { openSource, SourceError } from '@/import/source/openSource'
import type { ImportSource } from '@/import/source/types'
import { isImageFile } from '@/import/table/pictures'
import type { ImportMode } from '@/import/types'
import { TargetSelect } from '@/features/decks/TargetSelect'
import { liveTarget, targetFromParams, targetQuery, type Target } from '@/features/decks/target'
import { useAiSettings, useFreeQuota, useSignInStatus } from '@/hooks/useBrowser'
import { useDecks, useLessons } from '@/hooks/useDecks'
import { activeProviderConfig } from '@/lib/aiConfig'
import { startOpenRouterSignIn } from '@/lib/openrouterSignIn'
import { Button, ButtonLink } from '@/ui/Button'
import { shortDateTime } from '@/ui/format'
import { Icon, type IconName } from '@/ui/icons'
import { PageHeader } from '@/ui/PageHeader'
import { PagePicker, type PickedPage } from './PagePicker'
import { attachSource, startRun } from './runner'
import { isWordListFile, setWordListFile, WORD_LIST_ACCEPT } from './wordListFile'

/** One way to add cards: a row with an icon, a title and a line of explanation. */
function Way({ to, icon, title, note }: { to: string; icon: IconName; title: string; note: string }) {
  return (
    <Link to={to} className="flex items-center gap-4 px-5 py-4 hover:bg-sunken">
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent/10 text-accent">
        <Icon name={icon} className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{title}</span>
        <span className="block text-sm text-muted">{note}</span>
      </span>
      <Icon name="chevron" className="size-5 shrink-0 text-muted" />
    </Link>
  )
}

interface Picked {
  source: ImportSource
  warning?: string
  /** The sample page of the import demo. */
  demo?: boolean
}

export function ImportPage() {
  const navigate = useNavigate()
  const ai = useAiSettings()
  const config = activeProviderConfig(ai)
  const problems = configProblems(config)
  const signIn = useSignInStatus()
  const freeQuota = useFreeQuota(ai.mode === 'free' ? config.apiKey : '')
  const openImports = useLiveQuery(() => listOpenImports(), [])
  const fileInput = useRef<HTMLInputElement>(null)
  const [picked, setPicked] = useState<Picked>()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>()
  const [params, setParams] = useSearchParams()
  const decks = useDecks()
  const lessons = useLessons()
  const target: Target = decks && lessons ? liveTarget(targetFromParams(params), decks, lessons) : targetFromParams(params)
  const query = targetQuery(target)
  const withTarget = (path: string) => (query ? `${path}${path.includes('?') ? '&' : '?'}${query}` : path)

  async function onFiles(files: File[] | (() => Promise<File[]>), demo = false) {
    setLoading(true)
    setError(undefined)
    try {
      const list = typeof files === 'function' ? await files() : files
      if (!list.length) return
      const source = await openSource(list)
      const previous = await findImportsByHash(source.hash)
      const warning = previous.some((p) => p.status === 'committed')
        ? `You imported this file before (${shortDateTime(previous[0]!.createdAt)}). Duplicate cards will be marked in the review.`
        : previous.some((p) => p.status === 'draft')
          ? 'This file has an unfinished import below. You can continue it instead.'
          : undefined
      setPicked({ source, warning, demo })
    } catch (e) {
      setError(e instanceof SourceError ? e.message : 'Could not open the file.')
    } finally {
      setLoading(false)
    }
  }

  /**
   * A word list (Excel, CSV, TSV, an Anki/Pleco/Quizlet export) goes to its own screen, with any
   * pictures chosen along with it; PDFs and images on their own go to the AI.
   */
  function onChosen(files: File[]) {
    const lists = files.filter(isWordListFile)
    if (!lists.length) {
      void onFiles(files)
    } else if (lists.length > 1 || files.some((f) => !isWordListFile(f) && !isImageFile(f))) {
      setError('Choose one word list at a time (with its pictures, if any).')
    } else {
      setWordListFile(files)
      navigate(withTarget('/import/list'))
    }
  }

  async function start(pages: PickedPage[], mode: ImportMode) {
    if (!picked) return
    const { source, demo = false } = picked
    const record = await createImport({
      fileName: source.fileName,
      fileHash: source.hash,
      sourceKind: source.kind,
      pageCount: source.pages.length,
      pages: pages.map(({ page, rotation }) => ({ page, rotation, ...source.pages[page - 1]! })),
      provider: demo ? DEMO_MODEL : config.provider,
      model: demo ? DEMO_MODEL : config.model,
      mode,
      demo,
      target,
    })
    attachSource(record.id, source)
    void startRun(record.id, config, demo ? createDemoProvider() : undefined)
    navigate(`/import/${record.id}`)
  }

  if (picked) {
    return (
      <>
        <PageHeader title="Choose pages" />
        <PagePicker
          source={picked.source}
          warning={picked.warning}
          demo={picked.demo}
          blockedReason={problems.length && !picked.demo ? `AI not ready: ${problems.join(' ')}` : undefined}
          onCancel={() => {
            picked.source.destroy()
            setPicked(undefined)
          }}
          onStart={(pages, mode) => void start(pages, mode)}
        />
      </>
    )
  }

  return (
    <>
      <PageHeader title="Add cards" back={target.lessonId ? `/decks/${target.deckId}/${target.lessonId}` : query ? `/decks/${target.deckId}` : '/decks'} />

      {decks && lessons && (
        <label className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="font-medium">Add to</span>
          <TargetSelect value={target} onChange={(t) => setParams(targetQuery(t), { replace: true })} decks={decks} lessons={lessons} className="flex-1 basis-56" />
        </label>
      )}

      <nav aria-label="Ways to add cards" className="mb-6 divide-y divide-line overflow-hidden rounded-3xl border border-line bg-surface">
        <Way to={withTarget('/cards/new')} icon="pencil" title="Type a card" note="Characters, pinyin and meaning; a picture if you like." />
        <Way to={withTarget('/import/list?paste=1')} icon="cards" title="Paste from a spreadsheet" note="Copy the rows in Excel or Google Sheets and paste them. No AI needed." />
        <Way to={withTarget('/import/list')} icon="upload" title="Open a word list file" note="Excel, CSV, or an Anki, Pleco or Quizlet export. No AI needed." />
      </nav>

      <h2 className="mb-2 text-lg font-semibold">From a PDF or photos, with AI</h2>
      <section className="mb-6 rounded-3xl border border-line bg-surface p-5">
        <p className="mb-4 text-sm text-muted">
          Choose a PDF, or photos / screenshots of your course pages. The AI reads each page you pick, finds the vocabulary (characters,
          pinyin, meaning and picture) and fills in characters that are missing. You check every card before anything is added.
        </p>
        {problems.length > 0 ? (
          <div className="mb-4 rounded-xl bg-amber-100 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
            {signIn.kind === 'connecting' ? (
              'Finishing the OpenRouter sign-in…'
            ) : (
              <>
                {ai.mode === 'free' ? 'Connect a free AI service to read your pages: sign in with Google or e-mail, no key needed.' : `Set up an AI provider first: ${problems.join(' ')}`}{' '}
                <Link to="/settings/ai" className="font-semibold underline">
                  Open Settings
                </Link>
                {signIn.kind === 'error' && <span className="mt-2 block text-red-700 dark:text-red-300">{signIn.message}</span>}
                <Button size="sm" className="mt-3 w-full" onClick={() => void startOpenRouterSignIn(withTarget('/import'))}>
                  Connect free AI (OpenRouter)
                </Button>
              </>
            )}
          </div>
        ) : ai.mode === 'free' ? (
          <p className="mb-4 text-sm">
            Using <span className="font-semibold">free AI (OpenRouter)</span>
            {freeQuota ? ` · ${freeQuota.remaining} of ${freeQuota.limit} pages left today` : ''}
          </p>
        ) : (
          <p className="mb-4 text-sm">
            Using <span className="font-semibold">{serviceFor(config.provider, config.baseUrl).label}</span> ·{' '}
            <span className="font-mono text-xs">{config.model}</span>
          </p>
        )}
        <Button size="lg" className="w-full" onClick={() => fileInput.current?.click()} disabled={loading}>
          <Icon name="import" /> {loading ? 'Opening…' : 'Choose a PDF or images'}
        </Button>
        <input
          ref={fileInput}
          type="file"
          accept={`application/pdf,.pdf,image/*,${WORD_LIST_ACCEPT}`}
          multiple
          hidden
          onChange={(e) => {
            onChosen([...(e.target.files ?? [])])
            e.target.value = ''
          }}
        />
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        <div className="mt-4 border-t border-line pt-4">
          <p className="text-sm font-medium">Not sure yet?</p>
          <Button variant="secondary" className="mt-2 w-full" onClick={() => void onFiles(async () => [await createSamplePage()], true)} disabled={loading}>
            ▶ Try with a sample page
          </Button>
          <p className="mt-1 text-xs text-muted">No AI or sign-in needed: see what an import looks like, with ready-made answers.</p>
        </div>
      </section>

      {openImports && openImports.length > 0 && (
        <section>
          <h2 className="mb-2 text-lg font-semibold">Unfinished imports</h2>
          <ul className="flex flex-col gap-2">
            {openImports.map((imp) => (
              <li key={imp.id} className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{imp.fileName}</div>
                  <div className="text-xs text-muted">Started {shortDateTime(imp.createdAt)}</div>
                </div>
                <ButtonLink to={`/import/${imp.id}`} size="sm">
                  Continue
                </ButtonLink>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label="Discard import"
                  onClick={() => {
                    if (confirm(`Discard the import of ${imp.fileName}? No cards are added.`)) void discardImport(imp.id)
                  }}
                >
                  <Icon name="trash" className="size-5" />
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  )
}
