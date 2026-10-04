import { useLiveQuery } from 'dexie-react-hooks'
import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { createImport, discardImport, findImportsByHash, listOpenImports } from '@/data/repositories/imports'
import { configProblems } from '@/import/ai/createProvider'
import { serviceFor } from '@/import/ai/detectKey'
import { openSource, SourceError } from '@/import/source/openSource'
import type { ImportSource } from '@/import/source/types'
import { useAiSettings } from '@/hooks/useBrowser'
import { activeProviderConfig } from '@/lib/aiConfig'
import { Button, ButtonLink } from '@/ui/Button'
import { shortDateTime } from '@/ui/format'
import { Icon } from '@/ui/icons'
import { PageHeader } from '@/ui/PageHeader'
import { PagePicker, type PickedPage } from './PagePicker'
import { attachSource, startRun } from './runner'

interface Picked {
  source: ImportSource
  warning?: string
}

export function ImportPage() {
  const navigate = useNavigate()
  const ai = useAiSettings()
  const config = activeProviderConfig(ai)
  const problems = configProblems(config)
  const openImports = useLiveQuery(() => listOpenImports(), [])
  const fileInput = useRef<HTMLInputElement>(null)
  const [picked, setPicked] = useState<Picked>()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>()

  async function onFiles(files: File[]) {
    if (!files.length) return
    setLoading(true)
    setError(undefined)
    try {
      const source = await openSource(files)
      const previous = await findImportsByHash(source.hash)
      const warning = previous.some((p) => p.status === 'committed')
        ? `You imported this file before (${shortDateTime(previous[0]!.createdAt)}). Duplicate cards will be marked in the review.`
        : previous.some((p) => p.status === 'draft')
          ? 'This file has an unfinished import below. You can continue it instead.'
          : undefined
      setPicked({ source, warning })
    } catch (e) {
      setError(e instanceof SourceError ? e.message : 'Could not open the file.')
    } finally {
      setLoading(false)
    }
  }

  async function start(pages: PickedPage[]) {
    if (!picked) return
    const { source } = picked
    const record = await createImport({
      fileName: source.fileName,
      fileHash: source.hash,
      sourceKind: source.kind,
      pageCount: source.pages.length,
      pages: pages.map(({ page, rotation }) => ({ page, rotation, ...source.pages[page - 1]! })),
      provider: config.provider,
      model: config.model,
    })
    attachSource(record.id, source)
    void startRun(record.id, config)
    navigate(`/import/${record.id}`)
  }

  if (picked) {
    return (
      <>
        <PageHeader title="Choose pages" />
        <PagePicker
          source={picked.source}
          warning={picked.warning}
          blockedReason={problems.length ? `AI not ready: ${problems.join(' ')}` : undefined}
          onCancel={() => {
            picked.source.destroy()
            setPicked(undefined)
          }}
          onStart={(pages) => void start(pages)}
        />
      </>
    )
  }

  return (
    <>
      <PageHeader title="Import vocabulary" />

      <section className="mb-6 rounded-3xl border border-line bg-surface p-5">
        <p className="mb-4 text-sm text-muted">
          Choose a PDF, or photos / screenshots of your course pages. The AI reads each page you pick, finds the vocabulary (characters,
          pinyin, meaning and picture) and fills in characters that are missing. You check every card before anything is added.
        </p>
        {problems.length > 0 ? (
          <div className="mb-4 rounded-xl bg-amber-100 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
            Set up an AI provider first: {problems.join(' ')}{' '}
            <Link to="/settings" className="font-semibold underline">
              Open Settings
            </Link>
          </div>
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
          accept="application/pdf,.pdf,image/*"
          multiple
          hidden
          onChange={(e) => {
            void onFiles([...(e.target.files ?? [])])
            e.target.value = ''
          }}
        />
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
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
