import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import type { PictureDraftRecord, PictureJobRecord, PictureSheetRecord } from '@/data/db'
import {
  chooseOption,
  discardPictureJob,
  getPictureJob,
  listPictureDrafts,
  listPictureSheets,
  saveKeptPictures,
  setPictureJobStatus,
  updatePictureDraft,
} from '@/data/repositories/pictures'
import { Tip } from '@/features/onboarding/Tip'
import { cropFromImage } from '@/import/pdf/crop'
import type { NormBox } from '@/import/types'
import { useAiSettings, useBlobUrl, useNow } from '@/hooks/useBrowser'
import { getAiSettings, pictureSetup, saveAiSettings } from '@/lib/aiConfig'
import { getUsage, subscribeUsage } from '@/lib/aiUsage'
import { pictureSetupProblems, SERVICE_LABEL } from '@/pictures/createGenerator'
import { sheetCost } from '@/pictures/estimate'
import { layoutFor, SHEET_SIZES, type SheetSize } from '@/pictures/sheet'
import { PICTURE_STYLES, type PictureStyle } from '@/pictures/styles'
import { BoxEditor } from '@/ui/BoxEditor'
import { Button } from '@/ui/Button'
import { cn } from '@/ui/cn'
import { formatPrice, formatTokens, plural } from '@/ui/format'
import { Hanzi } from '@/ui/Hanzi'
import { Loading } from '@/ui/Loading'
import { PageHeader } from '@/ui/PageHeader'
import { usageLine } from '@/ui/usageText'
import { isPictureRunActive, pictureRunStore, planJob, regenerate, runJob, stopPictureRun } from './runner'

type Method = 'paid' | 'emoji'

/** Estimated cost of a paid run: per picture and in total, from the price tables. */
function useEstimate(count: number, style: PictureStyle, perSheet: SheetSize) {
  const setup = pictureSetup(useAiSettings())
  const sheets = Math.ceil(count / perSheet)
  // Full sheets use the chosen grid; the estimate ignores the cheaper last sheet.
  const cost = sheetCost(setup.service, setup.model, layoutFor(perSheet).aspect, style.quality)
  return {
    setup,
    sheets,
    perPicture: cost.usd !== undefined ? cost.usd / perSheet : undefined,
    total: cost.usd !== undefined ? cost.usd * sheets : undefined,
    tokens: cost.tokens !== undefined ? cost.tokens * sheets : undefined,
  }
}

function WordToggle({ draft }: { draft: PictureDraftRecord }) {
  const abstract = draft.plan && !draft.plan.picturable
  return (
    <button
      type="button"
      aria-pressed={draft.include}
      onClick={() => void updatePictureDraft(draft.id, { include: !draft.include })}
      title={abstract ? 'Hard to picture: tap to try anyway' : draft.plan?.scene}
      className={cn(
        'rounded-lg border px-2 py-1 text-left',
        draft.include ? 'border-accent bg-accent text-on-accent' : 'border-dashed border-line bg-surface text-muted',
      )}
    >
      <Hanzi className="text-lg">{draft.hanzi}</Hanzi>
      {draft.meaning && <span className="ml-1.5 text-xs opacity-80">{draft.meaning}</span>}
    </button>
  )
}

function Setup({ job, drafts }: { job: PictureJobRecord; drafts: PictureDraftRecord[] }) {
  const ai = useAiSettings()
  const [method, setMethod] = useState<Method>('paid')
  const style = PICTURE_STYLES.find((s) => s.id === ai.pictures.style) ?? PICTURE_STYLES[0]!
  const perSheet = ai.pictures.perSheet
  const included = drafts.filter((d) => d.include)
  const skipped = drafts.length - included.length
  const estimate = useEstimate(included.length, style, perSheet)
  const problems = pictureSetupProblems(estimate.setup)
  const withEmoji = included.filter((d) => d.plan?.emoji)

  const choose = (patch: Partial<typeof ai.pictures>) => saveAiSettings({ ...getAiSettings(), pictures: { ...getAiSettings().pictures, ...patch } })

  async function start() {
    await setPictureJobStatus(job.id, 'running', method === 'paid' ? { method, style: style.id, perSheet } : { method })
    void runJob(job.id)
  }

  return (
    <>
      <section className="mb-5">
        <h2 className="mb-1 font-semibold">Words</h2>
        <p className="mb-2 text-sm text-muted">
          {skipped > 0 ? `${plural(skipped, 'word')} look hard to picture and are left out (dashed). ` : ''}Tap a word to add or leave it out.
          {job.planFailed && ' The AI could not be asked about the words, so every word is in and its meaning is drawn.'}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {drafts.map((d) => (
            <WordToggle key={d.id} draft={d} />
          ))}
        </div>
      </section>

      <div className="mb-4 grid grid-cols-2 gap-1 rounded-xl bg-sunken p-1" role="radiogroup" aria-label="How to make the pictures">
        {(
          [
            ['paid', 'AI pictures'],
            ['emoji', 'Free: emoji'],
          ] as const
        ).map(([m, label]) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={method === m}
            onClick={() => setMethod(m)}
            className={cn('h-10 rounded-lg text-sm font-semibold transition', method === m ? 'bg-ink text-paper shadow-sm' : 'text-muted')}
          >
            {label}
          </button>
        ))}
      </div>

      {method === 'paid' ? (
        <section className="mb-24 flex flex-col gap-4">
          <p className="text-sm text-muted">
            {SERVICE_LABEL[estimate.setup.service]} · {estimate.setup.model || 'no model'} ·{' '}
            <Link to="/settings/ai" className="text-accent underline">
              change
            </Link>
          </p>
          {problems.length > 0 && <p className="rounded-xl bg-amber-100 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">{problems.join(' ')} Set it up in Settings → AI & pictures.</p>}

          <div role="radiogroup" aria-label="Style" className="grid gap-2 sm:grid-cols-2">
            {PICTURE_STYLES.map((s) => {
              const cost = sheetCost(estimate.setup.service, estimate.setup.model, layoutFor(perSheet).aspect, s.quality)
              return (
                <button
                  key={s.id}
                  type="button"
                  role="radio"
                  aria-checked={style.id === s.id}
                  onClick={() => choose({ style: s.id })}
                  className={cn('rounded-2xl border p-3 text-left transition', style.id === s.id ? 'border-accent ring-2 ring-accent/40' : 'border-line bg-surface')}
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="font-semibold">{s.label}</span>
                    <span className="text-xs text-muted">
                      {cost.usd !== undefined ? `≈ ${formatPrice(cost.usd / perSheet)} a picture` : 'price shown after'}
                    </span>
                  </span>
                  <span className="mt-0.5 block text-sm text-muted">{s.description}</span>
                  {cost.tokens !== undefined && <span className="mt-0.5 block text-xs text-muted">~{formatTokens(cost.tokens)} tokens a sheet</span>}
                </button>
              )
            })}
          </div>

          <div>
            <span className="mb-1.5 block text-sm font-semibold">Pictures per sheet</span>
            <div className="flex gap-2" role="radiogroup" aria-label="Pictures per sheet">
              {SHEET_SIZES.map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={perSheet === n}
                  onClick={() => choose({ perSheet: n })}
                  className={cn('h-9 rounded-full border px-4 text-sm', perSheet === n ? 'border-transparent bg-ink text-paper' : 'border-line text-muted')}
                >
                  {n}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-muted">One AI image holds several pictures, which are then cut apart: more per sheet is cheaper, fewer gives bigger pictures.</p>
          </div>

          <p className="text-sm">
            {plural(included.length, 'picture')} → {plural(estimate.sheets, 'sheet')}
            {estimate.total !== undefined && <> · about {formatPrice(estimate.total)}</>}
            {estimate.tokens !== undefined && <> (~{formatTokens(estimate.tokens)} image tokens)</>}
            <span className="block text-xs text-muted">
              Plus one request per sheet to your import AI, to find each picture on the sheet (free on the free plan).
              {estimate.total === undefined && ' OpenRouter reports the real cost after each sheet.'}
            </span>
          </p>
        </section>
      ) : (
        <section className="mb-24">
          <p className="mb-2 text-sm text-muted">
            Each word gets the emoji the AI picked, drawn with this device’s emoji font. No cost. AI-drawn icons and picture search come in the next update.
          </p>
          <div className="flex flex-wrap gap-2">
            {included.map((d) => (
              <span key={d.id} className="flex items-center gap-1.5 rounded-lg border border-line bg-surface px-2 py-1">
                <span className="text-2xl">{d.plan?.emoji || '—'}</span>
                <Hanzi>{d.hanzi}</Hanzi>
              </span>
            ))}
          </div>
          {withEmoji.length < included.length && (
            <p className="mt-2 text-xs text-muted">{plural(included.length - withEmoji.length, 'word')} without a fitting emoji will be skipped.</p>
          )}
        </section>
      )}

      <Footer>
        <Button
          className="flex-1"
          disabled={method === 'paid' ? included.length === 0 || problems.length > 0 : withEmoji.length === 0}
          onClick={() => void start()}
        >
          {method === 'paid' ? `Make ${plural(included.length, 'picture')}` : `Use ${plural(withEmoji.length, 'emoji', 'emoji')}`}
        </Button>
      </Footer>
    </>
  )
}

function Footer({ children }: { children: ReactNode }) {
  return (
    <div className="pb-safe sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] -mx-4 border-t border-line bg-paper/95 px-4 py-3 backdrop-blur md:bottom-0">
      <div className="flex gap-2">{children}</div>
    </div>
  )
}

function Thumb({ picture, id, className }: { picture?: { blob: Blob }; id: string; className?: string }) {
  const url = useBlobUrl(picture?.blob, picture ? id : undefined)
  return url ? <img src={url} alt="" className={cn('bg-white object-contain', className)} /> : null
}

function PictureTile({
  draft,
  job,
  busy,
  onAdjust,
}: {
  draft: PictureDraftRecord
  job: PictureJobRecord
  busy: boolean
  onAdjust(): void
}) {
  const key = `${draft.id}:${draft.updatedAt}`
  return (
    <li className={cn('flex flex-col rounded-2xl border bg-surface p-2', draft.keep && draft.status === 'ready' ? 'border-line' : 'border-dashed border-line')}>
      <div className="relative grid aspect-square place-items-center overflow-hidden rounded-xl bg-white">
        {draft.status === 'ready' ? (
          <Thumb picture={draft.picture} id={key} className={cn('size-full', !draft.keep && 'opacity-40')} />
        ) : draft.status === 'failed' ? (
          <p className="p-2 text-center text-xs text-red-700">{draft.error ?? 'No picture'}</p>
        ) : busy ? (
          <span className="size-6 animate-spin rounded-full border-2 border-accent border-t-transparent" aria-label="Drawing" />
        ) : (
          <p className="p-2 text-center text-xs text-muted">Not made yet</p>
        )}
        {draft.status === 'ready' && (
          <label className="absolute top-1.5 left-1.5 flex items-center rounded-md bg-black/55 p-1">
            <input
              type="checkbox"
              className="size-5 accent-(--color-accent)"
              checked={draft.keep}
              onChange={(e) => void updatePictureDraft(draft.id, { keep: e.target.checked })}
              aria-label={`Keep the picture for ${draft.hanzi}`}
            />
          </label>
        )}
      </div>
      <div className="mt-1.5 flex items-baseline gap-1.5 px-0.5">
        <Hanzi className="text-lg font-medium">{draft.hanzi}</Hanzi>
        <span className="truncate text-xs text-muted">{draft.meaning}</span>
      </div>
      {draft.options && draft.options.length > 0 && (
        <div className="mt-1.5">
          <p className="mb-1 text-xs text-muted">Pick one:</p>
          <div className="grid grid-cols-4 gap-1">
            {draft.options.map((o, i) => (
              <button key={i} type="button" onClick={() => void chooseOption(draft.id, i)} className="overflow-hidden rounded-md border border-line" aria-label={`Use version ${i + 1}`}>
                <Thumb picture={o} id={`${draft.id}:opt${i}:${draft.updatedAt}`} className="aspect-square w-full" />
              </button>
            ))}
          </div>
        </div>
      )}
      {job.method === 'paid' && (
        <div className="mt-1.5 flex gap-1">
          {draft.sheetId && draft.status === 'ready' && (
            <Button size="sm" variant="ghost" className="flex-1 px-1 text-xs" onClick={onAdjust} disabled={busy}>
              Adjust
            </Button>
          )}
          <Button size="sm" variant="ghost" className="flex-1 px-1 text-xs" onClick={() => void regenerate(job.id, draft.cardId)} disabled={busy}>
            {draft.status === 'failed' ? 'Try again' : '4 new'}
          </Button>
        </div>
      )}
    </li>
  )
}

function Results({ job, drafts, sheets }: { job: PictureJobRecord; drafts: PictureDraftRecord[]; sheets: PictureSheetRecord[] }) {
  const navigate = useNavigate()
  const run = useSyncExternalStore(pictureRunStore.subscribe, pictureRunStore.get)
  const busy = isPictureRunActive(job.id)
  const now = useNow(busy && run.waitingUntil ? 500 : 60_000)
  const usage = useSyncExternalStore(subscribeUsage, getUsage)
  const runUsage = usage.lastRun?.importId === job.id ? usage.lastRun : undefined
  const [adjusting, setAdjusting] = useState<PictureDraftRecord>()
  const [saving, setSaving] = useState(false)

  const shown = drafts.filter((d) => d.include || d.status !== 'waiting')
  const left = drafts.filter((d) => !d.include && d.status === 'waiting')
  const missing = drafts.filter((d) => d.include && d.status !== 'ready').length
  const kept = drafts.filter((d) => d.keep && d.status === 'ready').length
  const sheet = adjusting && sheets.find((s) => s.id === adjusting.sheetId)
  const back = job.from === 'import' ? '/boxes/0' : '/cards'

  async function save() {
    setSaving(true)
    await saveKeptPictures(job.id)
    navigate(back, { replace: true })
  }

  async function saveCrop(box: NormBox) {
    if (!adjusting || !sheet?.image) return undefined
    const picture = await cropFromImage(sheet.image, box)
    if (!picture) return 'That area is too small. Drag a larger box.'
    await updatePictureDraft(adjusting.id, { picture, box, keep: true })
    return undefined
  }

  return (
    <>
      <section className="mb-4 rounded-3xl border border-line bg-surface p-4 text-sm">
        {busy ? (
          <div className="flex items-center justify-between gap-3">
            <span>
              {run.phase === 'waiting' && run.waitingUntil
                ? `Waiting for the AI service, trying again in ${Math.max(0, Math.ceil((run.waitingUntil - now) / 1000))} s…`
                : run.phase === 'stopping'
                  ? 'Stopping…'
                  : `${run.step ?? 'Drawing'}…`}
            </span>
            <Button size="sm" variant="secondary" onClick={stopPictureRun} disabled={run.phase === 'stopping'}>
              Stop
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>
              {missing === shown.length
                ? 'No pictures yet.'
                : `${kept} of ${plural(shown.length, 'picture')} kept. Untick any you don’t like${job.method === 'paid' ? ', or ask for 4 new ones' : ''}.`}
            </span>
            {missing > 0 && (
              <Button size="sm" variant="secondary" onClick={() => void runJob(job.id)}>
                Make the missing {missing}
              </Button>
            )}
          </div>
        )}
        {run.jobId === job.id && run.fatal && <p className="mt-2 text-red-600">Stopped: {run.fatal}</p>}
        {runUsage && runUsage.requests > 0 && <p className="mt-2 text-xs text-muted">AI usage: {usageLine(runUsage)}</p>}
      </section>
      {kept > 0 && <Tip id="pictures" className="mb-4" />}

      <ul className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
        {shown.map((d) => (
          <PictureTile key={d.id} draft={d} job={job} busy={busy} onAdjust={() => setAdjusting(d)} />
        ))}
      </ul>

      {left.length > 0 && (
        <section className="mb-24">
          <p className="mb-1.5 text-sm text-muted">Left out (hard to picture). Tap one to add it, then “Make the missing”.</p>
          <div className="flex flex-wrap gap-1.5">
            {left.map((d) => (
              <WordToggle key={d.id} draft={d} />
            ))}
          </div>
        </section>
      )}

      <Footer>
        <Button
          variant="ghost"
          onClick={() => {
            stopPictureRun()
            void discardPictureJob(job.id).then(() => navigate(back, { replace: true }))
          }}
        >
          Discard
        </Button>
        <Button className="flex-1" disabled={busy || saving || kept === 0} onClick={() => void save()}>
          Save {plural(kept, 'picture')}
        </Button>
      </Footer>

      {adjusting && sheet?.image && (
        <BoxEditor
          image={sheet.image}
          imageKey={sheet.id}
          aspectRatio={sheet.width && sheet.height ? `${sheet.width} / ${sheet.height}` : undefined}
          imageLabel="Generated sheet"
          title={<Hanzi className="text-xl font-semibold">{adjusting.hanzi}</Hanzi>}
          subtitle={adjusting.meaning}
          initialBox={adjusting.box ?? null}
          otherBoxes={(sheet.boxes ?? []).filter((_, i) => i !== adjusting.cell)}
          onSave={saveCrop}
          onClose={() => setAdjusting(undefined)}
        />
      )}
    </>
  )
}

export function PicturesPage() {
  const jobId = useParams().jobId!
  const job = useLiveQuery(async () => (await getPictureJob(jobId)) ?? null, [jobId])
  const drafts = useLiveQuery(() => listPictureDrafts(jobId), [jobId])
  const sheets = useLiveQuery(() => listPictureSheets(jobId), [jobId])
  const run = useSyncExternalStore(pictureRunStore.subscribe, pictureRunStore.get)

  // Planning starts by itself (and resumes after a reload).
  useEffect(() => {
    if (job?.status === 'planning' && !isPictureRunActive()) void planJob(jobId)
  }, [job?.status, jobId])

  if (job === undefined || !drafts || !sheets) return <Loading />
  if (job === null) {
    return (
      <>
        <PageHeader title="Pictures" back="/cards" />
        <p className="text-muted">These pictures were already saved or discarded.</p>
      </>
    )
  }

  return (
    <>
      <PageHeader title="Pictures for cards" subtitle={plural(drafts.length, 'card')} back={job.from === 'import' ? '/boxes/0' : '/cards'} />
      {job.status === 'planning' ? (
        <p className="py-8 text-center text-muted">
          {run.jobId === jobId && run.fatal ? `Stopped: ${run.fatal}` : `Looking at ${plural(drafts.length, 'word')}: which can be pictured, and how…`}
        </p>
      ) : job.status === 'setup' ? (
        <Setup job={job} drafts={drafts} />
      ) : (
        <Results job={job} drafts={drafts} sheets={sheets} />
      )}
    </>
  )
}
