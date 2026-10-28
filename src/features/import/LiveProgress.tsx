import type { LiveWord } from '@/import/extract/partial'
import type { ExtractionStage } from '@/import/extract/runExtraction'
import { useNow } from '@/hooks/useBrowser'
import { estimateRemainingMs, formatAbout } from '@/lib/importTiming'
import { cn } from '@/ui/cn'
import { plural } from '@/ui/format'
import { Skeleton } from '@/ui/Skeleton'
import type { RunState } from './runner'

const STEPS: readonly ExtractionStage[] = ['preparing', 'sending', 'thinking', 'writing', 'checking', 'saving']
/** Chips shown under "Writing cards"; the rest are counted. */
const MAX_CHIPS = 12

/** "0:42", "12:05" */
function clock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** " · about 3 min left", from how long pages usually take with this model; nothing until that is known. */
export function TimeLeft({ run, pagesWaiting }: { run: RunState; pagesWaiting: number }) {
  const now = useNow(1000)
  if (!run.typicalPageMs) return null
  const ms = estimateRemainingMs(run.typicalPageMs, pagesWaiting, run.pageStartedAt === undefined ? undefined : now - run.pageStartedAt)
  return <span className="font-normal text-muted"> · {ms < 5000 ? 'almost done' : `${formatAbout(ms)} left`}</span>
}

type StepStatus = 'done' | 'active' | 'pending'

interface StepText {
  /** While it happens; `detail` (counts, timers) is shown after it and isn't announced. */
  active: string
  detail?: string
  done: string
  pending: string
}

function stepText(step: ExtractionStage, run: RunState, reading: boolean, stageMs: number): StepText {
  const service = run.service ?? 'the AI'
  const count = run.liveCount
  const unit = reading ? 'sentence' : 'card'
  switch (step) {
    case 'preparing':
      return { active: 'Preparing the page…', done: 'Page prepared', pending: 'Preparing the page' }
    case 'sending':
      return { active: `Sent to ${service} · waiting for an answer…`, detail: clock(stageMs), done: `Sent to ${service}`, pending: `Sending to ${service}` }
    case 'thinking':
      return {
        active: 'AI is thinking…',
        detail: run.reasoningTokens ? `~${run.reasoningTokens.toLocaleString()} tokens` : clock(stageMs),
        done: 'AI read the page',
        pending: 'AI is thinking',
      }
    case 'writing':
      return {
        active: `Writing ${unit}s…`,
        detail: `${count ?? 0} so far`,
        done: count !== undefined ? `Wrote ${plural(count, unit)}` : `${reading ? 'Sentences' : 'Cards'} written`,
        pending: `Writing ${unit}s`,
      }
    case 'checking':
      return { active: 'Checking pinyin & characters…', done: 'Checked pinyin & characters', pending: 'Checking pinyin & characters' }
    case 'saving':
      return { active: 'Saving…', done: 'Saved', pending: 'Saving' }
  }
}

function StepMark({ status }: { status: StepStatus }) {
  if (status === 'done') return <span className="w-4 shrink-0 text-center font-semibold text-accent">✓</span>
  // Level with the first line of the label.
  return (
    <span className="grid h-5 w-4 shrink-0 place-items-center">
      <span className={cn('size-2 rounded-full', status === 'active' ? 'bg-accent motion-safe:animate-pulse' : 'border border-muted/60')} />
    </span>
  )
}

/** The page being read: its picture, how long it has taken, and each step with ✓ / ● / ○. */
export function CurrentPage({ run, reading }: { run: RunState; reading: boolean }) {
  const now = useNow(500)
  if (run.page === undefined) {
    return <p className="text-sm text-muted">{run.phase === 'stopping' ? 'Stopping…' : 'Getting the next page ready…'}</p>
  }
  const waiting = run.phase === 'waiting' && run.waitingUntil !== undefined
  // While waiting to try again, the request is what's next.
  const current: ExtractionStage = waiting ? 'sending' : (run.stage ?? 'preparing')
  const currentIndex = STEPS.indexOf(current)
  const stageMs = run.stageSince === undefined ? 0 : now - run.stageSince
  const attempts = run.attempt && run.maxAttempts ? ` (attempt ${run.attempt} of ${run.maxAttempts})` : ''
  const seconds = waiting ? Math.max(0, Math.ceil((run.waitingUntil! - now) / 1000)) : 0
  const waitText =
    seconds > 0
      ? `${run.waitReason === 'rate limit' ? 'Rate limit reached' : 'Something went wrong'} — trying again in ${seconds} s${attempts}`
      : `Retrying…${attempts}`
  const activeText = waiting ? waitText : stepText(current, run, reading, stageMs).active
  const words = run.liveItems ?? []

  return (
    <div className="rounded-2xl border border-line bg-paper p-3">
      <div className="flex gap-3">
        {run.preview ? (
          <img src={run.preview} alt="" className="h-16 w-12 shrink-0 rounded-md border border-line bg-white object-cover object-top" />
        ) : (
          <Skeleton className="h-16 w-12 shrink-0 rounded-md" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <p className="truncate font-semibold">{run.pageLabel}</p>
            <span className="shrink-0 text-sm text-muted tabular-nums">
              <span className="sr-only">Time on this page: </span>
              {clock(run.pageStartedAt === undefined ? 0 : now - run.pageStartedAt)}
            </span>
          </div>
          {run.typicalPageMs !== undefined && <p className="text-xs text-muted">Usually {formatAbout(run.typicalPageMs)} per page with this model</p>}
          {run.attempt !== undefined && run.attempt > 1 && !waiting && <p className="text-xs text-muted">Attempt {run.attempt}{run.maxAttempts ? ` of ${run.maxAttempts}` : ''}</p>}
        </div>
      </div>

      <p className="sr-only" aria-live="polite">
        {run.pageLabel}: {waiting ? `${run.waitReason === 'rate limit' ? 'rate limit reached' : 'something went wrong'}, trying again soon` : activeText}
      </p>
      <ol className="mt-3 flex flex-col gap-1 text-sm">
        {STEPS.map((step, i) => {
          const status: StepStatus = i < currentIndex ? 'done' : i === currentIndex ? 'active' : 'pending'
          const text = stepText(step, run, reading, stageMs)
          return (
            <li key={step} className={cn('flex gap-2', status === 'pending' && 'text-muted')}>
              <StepMark status={status} />
              {status === 'active' ? (
                <span className={cn('min-w-0 font-medium', waiting && 'text-amber-700 dark:text-amber-400')}>
                  {activeText}
                  {!waiting && text.detail && <span className="ml-1.5 font-normal text-muted tabular-nums">{text.detail}</span>}
                </span>
              ) : (
                <span className="min-w-0">{status === 'done' ? text.done : text.pending}</span>
              )}
            </li>
          )
        })}
      </ol>
      {run.phase === 'stopping' && <p className="mt-2 text-sm text-muted">Stopping after this step…</p>}

      {words.length > 0 && (
        <div className="mt-3">
          <p className="mb-1.5 text-xs font-medium text-muted">Words so far</p>
          <ul className="flex flex-wrap gap-1.5">
            {words.slice(0, MAX_CHIPS).map((w, i) => (
              <li key={`${i}:${w.hanzi}`} className="max-w-full truncate rounded-full border border-line bg-surface px-2.5 py-0.5 motion-safe:animate-reveal">
                <span lang="zh-Hant">{w.hanzi}</span>
                {w.pinyin && <span className="ml-1 text-xs text-muted">{w.pinyin}</span>}
              </li>
            ))}
            {words.length > MAX_CHIPS && <li className="px-1 py-0.5 text-xs text-muted">+{words.length - MAX_CHIPS} more</li>}
          </ul>
        </div>
      )}
    </div>
  )
}

const ghostField = 'flex min-w-0 items-center rounded-lg border border-line bg-paper px-2.5 text-muted'

/** A card still on its way, laid out like DraftCard; filled in with what the reply has said so far. */
function DraftSkeleton({ word, reading }: { word?: LiveWord; reading: boolean }) {
  return (
    <li className="rounded-2xl border border-dashed border-line bg-surface p-3 motion-safe:animate-reveal">
      <div className="flex gap-3">
        <div className="flex items-start pt-1">
          <Skeleton className="size-5 rounded" />
        </div>
        {!reading && <Skeleton className="size-24 shrink-0 rounded-xl sm:size-28" />}
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          {word?.hanzi ? (
            <p lang="zh-Hant" className={cn(ghostField, 'h-11 text-2xl')}>
              <span className="truncate">{word.hanzi}</span>
            </p>
          ) : (
            <Skeleton className="h-11" />
          )}
          <div className="flex gap-2">
            {word?.pinyin ? (
              <p className={cn(ghostField, 'h-10 flex-1')}>
                <span className="truncate">{word.pinyin}</span>
              </p>
            ) : (
              <Skeleton className="h-10 min-w-0 flex-1" />
            )}
            {word?.meaning ? (
              <p className={cn(ghostField, 'h-10 flex-1')}>
                <span className="truncate">{word.meaning}</span>
              </p>
            ) : (
              <Skeleton className="h-10 min-w-0 flex-1" />
            )}
          </div>
        </div>
      </div>
      <div className="mt-2 flex gap-1.5">
        <Skeleton className="h-5 w-14 rounded-full" />
        <Skeleton className="h-5 w-20 rounded-full" />
      </div>
    </li>
  )
}

/** Where the page being read will appear: placeholder cards, filled in as the reply arrives. */
export function LivePageGroup({ run, reading }: { run: RunState; reading: boolean }) {
  const words = run.liveItems ?? []
  return (
    <section className="mb-6" aria-busy="true" aria-label={`${run.pageLabel}, being read`}>
      <h3 className="mb-2 font-semibold">
        {run.pageLabel} <span className="text-sm font-normal text-muted">· being read</span>
      </h3>
      <ul className="flex flex-col gap-3">
        {words.map((w, i) => (
          <DraftSkeleton key={`${i}:${w.hanzi}`} word={w} reading={reading} />
        ))}
        {Array.from({ length: words.length > 0 ? 1 : 2 }, (_, i) => (
          <DraftSkeleton key={`next-${i}`} reading={reading} />
        ))}
      </ul>
    </section>
  )
}
