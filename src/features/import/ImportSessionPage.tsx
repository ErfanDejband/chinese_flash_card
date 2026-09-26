import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import type { ImportDraftRecord, ImportPageRecord } from '@/data/db'
import {
  commitImport,
  discardImport,
  getImport,
  isImportable,
  listDrafts,
  listImportPages,
  queuePages,
  setDraftsSelected,
} from '@/data/repositories/imports'
import { configProblems } from '@/import/ai/createProvider'
import { openPdf } from '@/import/pdf/pdf'
import type { NormBox } from '@/import/types'
import { useAiSettings } from '@/hooks/useBrowser'
import { activeProviderConfig } from '@/lib/aiConfig'
import { sha256Hex } from '@/lib/hash'
import { Button } from '@/ui/Button'
import { plural } from '@/ui/format'
import { Loading } from '@/ui/Loading'
import { PageHeader } from '@/ui/PageHeader'
import { CropEditor } from './CropEditor'
import { DraftCard } from './DraftCard'
import { formatPageRanges } from './pageRanges'
import { attachPdf, hasPdf, isRunning, runStore, startRun, stopRun } from './runner'

function useCountdown(until: number | undefined): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!until) return
    const t = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(t)
  }, [until])
  return until ? Math.max(0, Math.ceil((until - now) / 1000)) : 0
}

function Progress({ importId, fileHash, pages }: { importId: string; fileHash: string; pages: ImportPageRecord[] }) {
  const run = useSyncExternalStore(runStore.subscribe, runStore.get)
  const config = activeProviderConfig(useAiSettings())
  const problems = configProblems(config)
  const fileInput = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string>()
  const running = isRunning(importId)
  const seconds = useCountdown(running && run.phase === 'waiting' ? run.waitingUntil : undefined)

  const done = pages.filter((p) => p.status === 'done').length
  const failed = pages.filter((p) => p.status === 'error')
  const remaining = pages.filter((p) => p.status === 'pending' || (p.status === 'running' && !running)).length
  const total = pages.length

  async function resume(retryFailed: boolean) {
    setError(undefined)
    if (retryFailed) await queuePages(importId, failed.map((p) => p.page))
    if (!hasPdf(importId)) {
      fileInput.current?.click()
      return
    }
    void startRun(importId, config)
  }

  async function reattach(file: File | undefined) {
    if (!file) return
    const bytes = new Uint8Array(await file.arrayBuffer())
    const hash = await sha256Hex(bytes)
    if (fileHash && hash && hash !== fileHash) {
      setError('That is a different file. Choose the PDF this import started with.')
      return
    }
    attachPdf(importId, await openPdf(bytes.slice()))
    void startRun(importId, config)
  }

  return (
    <section className="mb-6 rounded-3xl border border-line bg-surface p-4">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <span className="font-semibold">
          {done} of {plural(total, 'page')} read
        </span>
        {failed.length > 0 && <span className="text-sm text-red-600">{failed.length} failed</span>}
      </div>
      <div className="mb-3 h-2 overflow-hidden rounded-full bg-sunken">
        <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
      </div>

      {running ? (
        <>
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted">
              {run.phase === 'waiting'
                ? `Page ${run.page}: ${run.waitReason === 'rate limit' ? 'rate limit reached' : 'retrying'}, trying again in ${seconds} s…`
                : run.phase === 'stopping'
                  ? 'Stopping after this step…'
                  : `Reading page ${run.page ?? '…'}…`}
            </p>
            <Button size="sm" variant="secondary" onClick={stopRun} disabled={run.phase === 'stopping'}>
              Pause
            </Button>
          </div>
          <p className="mt-1 text-xs text-muted">Keep the app open: phones pause apps in the background.</p>
        </>
      ) : (
        <div className="flex flex-col gap-2">
          {run.importId === importId && run.fatal && <p className="text-sm text-red-600">Stopped: {run.fatal}</p>}
          {problems.length > 0 && (remaining > 0 || failed.length > 0) && (
            <p className="text-sm text-amber-700 dark:text-amber-400">
              AI not ready: {problems.join(' ')} <Link to="/settings" className="underline">Settings</Link>
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {remaining > 0 && (
              <Button size="sm" onClick={() => void resume(false)} disabled={problems.length > 0}>
                Continue ({plural(remaining, 'page')} left)
              </Button>
            )}
            {failed.length > 0 && (
              <Button size="sm" variant="secondary" onClick={() => void resume(true)} disabled={problems.length > 0}>
                Retry failed pages ({formatPageRanges(failed.map((p) => p.page))})
              </Button>
            )}
          </div>
          {!hasPdf(importId) && (remaining > 0 || failed.length > 0) && (
            <p className="text-xs text-muted">You will be asked to choose the PDF again to continue.</p>
          )}
        </div>
      )}
      {failed.length > 0 && !running && (
        <details className="mt-2 text-xs text-muted">
          <summary className="cursor-pointer">Why pages failed</summary>
          <ul className="mt-1 list-disc pl-5">
            {failed.map((p) => (
              <li key={p.id}>
                Page {p.page}: {p.error}
              </li>
            ))}
          </ul>
        </details>
      )}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <input
        ref={fileInput}
        type="file"
        accept="application/pdf,.pdf"
        hidden
        onChange={(e) => {
          void reattach(e.target.files?.[0])
          e.target.value = ''
        }}
      />
    </section>
  )
}

function PageGroup({ page, drafts, onEditImage }: { page: number; drafts: ImportDraftRecord[]; onEditImage(d: ImportDraftRecord): void }) {
  const allOn = drafts.every((d) => d.selected)
  return (
    <section className="mb-6">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-semibold">
          Page {page} <span className="text-sm font-normal text-muted">· {plural(drafts.length, 'item')}</span>
        </h3>
        <button
          type="button"
          className="text-sm font-medium text-accent"
          onClick={() => void setDraftsSelected(drafts.filter((d) => d.hanzi.trim()).map((d) => d.id), !allOn)}
        >
          {allOn ? 'Deselect page' : 'Select page'}
        </button>
      </div>
      <ul className="flex flex-col gap-3">
        {drafts.map((d) => (
          <DraftCard key={d.id} draft={d} onEditImage={() => onEditImage(d)} />
        ))}
      </ul>
    </section>
  )
}

export function ImportSessionPage() {
  const importId = useParams().importId!
  const navigate = useNavigate()
  const record = useLiveQuery(async () => (await getImport(importId)) ?? null, [importId])
  const pages = useLiveQuery(() => listImportPages(importId), [importId])
  const drafts = useLiveQuery(() => listDrafts(importId), [importId])
  const [editing, setEditing] = useState<ImportDraftRecord>()
  const [committing, setCommitting] = useState(false)
  const running = useSyncExternalStore(runStore.subscribe, () => isRunning(importId))

  if (record === undefined || !pages || !drafts) return <Loading />
  if (record === null || record.status !== 'draft') {
    return (
      <>
        <PageHeader title="Import finished" back="/import" />
        <p className="text-muted">This import was already {record?.status === 'committed' ? 'added to your cards' : 'closed'}.</p>
      </>
    )
  }

  const byPage = new Map<number, ImportDraftRecord[]>()
  for (const d of drafts) byPage.set(d.page, [...(byPage.get(d.page) ?? []), d])
  const emptyPages = pages.filter((p) => p.status === 'done' && !byPage.has(p.page)).map((p) => p.page)
  const importable = drafts.filter(isImportable).length
  const editingPage = editing && pages.find((p) => p.page === editing.page)

  async function commit() {
    setCommitting(true)
    try {
      await commitImport(importId)
      navigate('/boxes/0', { replace: true })
    } finally {
      setCommitting(false)
    }
  }

  return (
    <>
      <PageHeader title="Review import" subtitle={record.fileName} back="/import" />
      <Progress importId={importId} fileHash={record.fileHash} pages={pages} />

      {drafts.length === 0 ? (
        <p className="py-8 text-center text-muted">{running ? 'Cards appear here as pages are read.' : 'No vocabulary found yet.'}</p>
      ) : (
        [...byPage.entries()].map(([page, list]) => <PageGroup key={page} page={page} drafts={list} onEditImage={setEditing} />)
      )}
      {emptyPages.length > 0 && <p className="mb-6 text-sm text-muted">Nothing to learn on page {formatPageRanges(emptyPages)}.</p>}

      <div className="pb-safe sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] -mx-4 border-t border-line bg-paper/95 px-4 py-3 backdrop-blur md:bottom-0">
        {running && <p className="mb-2 text-xs text-muted">You can review while pages are being read; pause to import.</p>}
        <div className="flex gap-2">
          <Button
            variant="ghost"
            onClick={() => {
              if (!confirm('Discard this import? No cards are added.')) return
              stopRun()
              void discardImport(importId).then(() => navigate('/import', { replace: true }))
            }}
          >
            Discard
          </Button>
          <Button className="flex-1" disabled={!importable || running || committing} onClick={() => void commit()}>
            Add {plural(importable, 'card')}
          </Button>
        </div>
      </div>

      {editing && editingPage && (
        <CropEditor
          draft={editing}
          page={editingPage}
          otherBoxes={(byPage.get(editing.page) ?? []).filter((d) => d.id !== editing.id && d.imageBox).map((d) => d.imageBox as NormBox)}
          onClose={() => setEditing(undefined)}
        />
      )}
    </>
  )
}
