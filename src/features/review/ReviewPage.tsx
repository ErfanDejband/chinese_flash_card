import { useEffect, useEffectEvent, useMemo, useReducer, useState, type ReactNode } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router'
import { loadDeck } from '@/data/repositories/cards'
import { recordAnswer, undoAnswer, type AnswerUndoToken } from '@/data/repositories/review'
import { getSettings } from '@/data/repositories/settings'
import { toLocalDate } from '@/domain/dates'
import type { DeckEntry } from '@/domain/deck'
import { newCardPool } from '@/domain/deck'
import { planSession, type SessionPlan, type SessionRequest } from '@/domain/session/plan'
import {
  againProgress,
  attemptNumber,
  currentCardId,
  isFinished,
  isFirstAnswer,
  lastHistoryEntry,
  retriedCards,
  sessionReducer,
  sessionStats,
  startSession,
} from '@/domain/session/reducer'
import type { AppSettings, ReviewResult } from '@/domain/types'
import { requestSync } from '@/lib/syncRunner'
import { Button, ButtonLink } from '@/ui/Button'
import { plural } from '@/ui/format'
import { Hanzi } from '@/ui/Hanzi'
import { Icon } from '@/ui/icons'
import { Loading } from '@/ui/Loading'
import { ReviewCard } from './ReviewCard'

function parseRequest(query: string): SessionRequest {
  const params = new URLSearchParams(query)
  const count = Number(params.get('new'))
  if (params.has('new') && Number.isInteger(count) && count > 0) return { kind: 'new', count: Math.min(count, 200) }
  const box = Number(params.get('box'))
  if (params.has('box') && Number.isInteger(box) && box > 0) return { kind: 'box', box }
  return { kind: 'daily' }
}

/** Where ✕ and "Back" lead: the Progress tab when the session was started there, else Home. */
function useReturnTo(): { to: string; label: string; state: unknown } {
  const state = useLocation().state as { from?: unknown } | null
  return state?.from === '/progress' ? { to: '/progress', label: 'Back to progress', state } : { to: '/', label: 'Back to home', state }
}

interface Loaded {
  entries: DeckEntry[]
  settings: AppSettings
  plan: SessionPlan
  request: SessionRequest
}

export function ReviewPage() {
  const [params] = useSearchParams()
  const query = params.toString()
  // Remount per query so each session starts from a fresh plan.
  return <ReviewLoader key={query} query={query} />
}

/** Loads the deck once: the session plan must not change while answers are being written. */
function ReviewLoader({ query }: { query: string }) {
  const [loaded, setLoaded] = useState<Loaded>()
  useEffect(() => {
    let active = true
    void getSettings().then(async (settings) => {
      const entries = await loadDeck(settings.reviewMode)
      if (!active) return
      const request = parseRequest(query)
      const plan = planSession(entries, request, {
        today: toLocalDate(new Date()),
        config: settings.leitner,
        newPerDay: settings.newPerDay,
      })
      setLoaded({ entries, settings, plan, request })
    })
    return () => {
      active = false
    }
  }, [query])

  if (!loaded) return <Loading label="Preparing your cards…" />
  if (loaded.plan.cardIds.length === 0) return <NothingToReview {...loaded} />
  return <ReviewSession {...loaded} />
}

function Shell({ children }: { children: ReactNode }) {
  return <div className="pt-safe mx-auto flex min-h-dvh max-w-xl flex-col px-4">{children}</div>
}

function NothingToReview({ entries, request }: Loaded) {
  const back = useReturnTo()
  const pool = newCardPool(entries).length
  const extra = Math.min(pool, 5)
  return (
    <Shell>
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
        <div className="text-5xl">✨</div>
        <h1 className="text-2xl font-bold">{request.kind === 'box' ? `Nothing due in Box ${request.box}` : 'Nothing to review right now'}</h1>
        <p className="text-muted">{pool > 0 ? `${plural(pool, 'card')} waiting in the new-card pool.` : 'Come back when cards are due.'}</p>
        <div className="mt-6 flex w-full max-w-xs flex-col gap-3">
          {extra > 0 && (
            <ButtonLink to={`/review?new=${extra}`} replace state={back.state} size="lg">
              Learn {plural(extra, 'new card')}
            </ButtonLink>
          )}
          <ButtonLink to={back.to} variant="secondary" size="lg">
            {back.label}
          </ButtonLink>
        </div>
      </div>
    </Shell>
  )
}

function ReviewSession({ entries, settings, plan }: Loaded) {
  const byId = useMemo(() => new Map(entries.map((e) => [e.card.id, e])), [entries])
  const [state, dispatch] = useReducer(sessionReducer, plan, (p) => startSession(p.cardIds, p.newIds))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const back = useReturnTo()

  const finished = isFinished(state)
  // Send today's answers to the other devices (silently; never a sign-in hop mid-review).
  useEffect(() => {
    if (finished) requestSync('review')
  }, [finished])

  const cardId = currentCardId(state)
  const entry = cardId ? byId.get(cardId) : undefined
  const last = lastHistoryEntry(state)
  const stats = sessionStats(state)

  async function answer(result: ReviewResult) {
    if (!cardId || busy || !state.revealed) return
    setBusy(true)
    setError(undefined)
    try {
      const undoToken = isFirstAnswer(state, cardId) ? await recordAnswer(cardId, result, settings.leitner, new Date(), settings.reviewMode) : undefined
      dispatch({ type: 'answer', result, undoToken })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the answer')
    } finally {
      setBusy(false)
    }
  }

  async function undo() {
    if (!last || busy) return
    setBusy(true)
    try {
      if (last.undoToken) await undoAnswer(last.undoToken as AnswerUndoToken)
      dispatch({ type: 'undo' })
    } finally {
      setBusy(false)
    }
  }

  const onKey = useEffectEvent((e: KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') void undo()
      return
    }
    if (!state.revealed && (e.key === ' ' || e.key === 'Enter')) {
      e.preventDefault()
      dispatch({ type: 'reveal' })
    } else if (state.revealed && (e.key === 'ArrowLeft' || e.key === '1')) {
      void answer('forgot')
    } else if (state.revealed && (e.key === 'ArrowRight' || e.key === '2' || e.key === ' ')) {
      e.preventDefault()
      void answer('knew')
    } else if (e.key === 'u') {
      void undo()
    }
  })
  useEffect(() => {
    const handler = (e: KeyboardEvent) => onKey(e)
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  if (finished) {
    const hardest = retriedCards(state)
    return (
      <Shell>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <div className="text-6xl">🎉</div>
          <h1 className="text-2xl font-bold">Session complete</h1>
          <dl className="my-4 grid w-full max-w-sm grid-cols-3 gap-3">
            {[
              ['Knew', stats.knew, 'text-emerald-600 dark:text-emerald-400'],
              ['Forgot', stats.forgot, 'text-rose-600 dark:text-rose-400'],
              ['New', stats.learnedNew, 'text-ink'],
            ].map(([label, value, color]) => (
              <div key={label} className="rounded-2xl border border-line bg-surface p-3">
                <dd className={`text-3xl font-bold tabular-nums ${color}`}>{value}</dd>
                <dt className="text-sm text-muted">{label}</dt>
              </div>
            ))}
          </dl>
          {hardest.length > 0 && (
            <section className="mb-4 w-full max-w-sm text-left">
              <h2 className="mb-2 text-sm font-bold tracking-wide text-muted uppercase">Hardest cards</h2>
              <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
                {hardest.map(({ cardId, tries }) => {
                  const card = byId.get(cardId)?.card
                  return (
                    <li key={cardId} className="flex items-baseline gap-3 px-4 py-2">
                      <Hanzi className="text-xl">{card?.hanzi}</Hanzi>
                      <span className="min-w-0 flex-1 truncate text-sm text-muted">{card?.pinyin}</span>
                      <span className="text-sm text-rose-600 tabular-nums dark:text-rose-400">{tries} tries</span>
                    </li>
                  )
                })}
              </ul>
            </section>
          )}
          <div className="flex w-full max-w-xs flex-col gap-3">
            <ButtonLink to={back.to} size="lg">
              {back.label}
            </ButtonLink>
            {last && (
              <Button variant="ghost" onClick={() => void undo()} disabled={busy}>
                <Icon name="undo" className="size-5" /> Undo last answer
              </Button>
            )}
          </div>
        </div>
      </Shell>
    )
  }

  const progress = state.total ? stats.answered / state.total : 0
  const again = againProgress(state)

  return (
    <Shell>
      {/* Grid so the again bar (second row, once something was forgotten) lines up under the main bar. */}
      <div className="grid grid-cols-[auto_1fr_auto_auto] grid-rows-[3.5rem] items-center gap-x-3">
        <Link to={back.to} className="-ml-2 grid size-10 place-items-center rounded-full text-muted hover:bg-sunken" aria-label="End session">
          <Icon name="x" />
        </Link>
        <div className="h-2 overflow-hidden rounded-full bg-sunken" role="progressbar" aria-valuenow={stats.answered} aria-valuemax={state.total}>
          <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${progress * 100}%` }} />
        </div>
        <span className="min-w-16 text-right text-sm text-muted tabular-nums">
          {stats.answered}/{state.total}
        </span>
        <button
          type="button"
          onClick={() => void undo()}
          disabled={!last || busy}
          className="-mr-2 grid size-10 place-items-center rounded-full text-muted hover:bg-sunken disabled:opacity-30"
          aria-label="Undo last answer"
        >
          <Icon name="undo" />
        </button>
        {again.total > 0 && (
          <>
            <div
              className="col-start-2 -mt-3 mb-2 h-1.5 overflow-hidden rounded-full bg-sunken"
              role="progressbar"
              aria-label="Forgotten cards cleared"
              aria-valuenow={again.done}
              aria-valuemax={again.total}
            >
              <div className="h-full rounded-full bg-rose-500 transition-all" style={{ width: `${(again.done / again.total) * 100}%` }} />
            </div>
            <span className="-mt-3 mb-2 text-right text-xs text-rose-600 tabular-nums dark:text-rose-400">
              Again {again.done}/{again.total}
            </span>
          </>
        )}
      </div>

      {entry && (
        <ReviewCard
          key={`${entry.card.id}-${state.history.length}`}
          card={entry.card}
          box={entry.state.box}
          attempt={attemptNumber(state, entry.card.id)}
          revealed={state.revealed}
          voiceURI={settings.ttsVoiceURI}
          mode={settings.reviewMode}
        />
      )}

      {error && <p className="mb-2 text-center text-sm text-red-600">{error}</p>}

      <div className="pb-safe sticky bottom-0 bg-paper pt-2">
        <div className="pb-4">
          {!state.revealed ? (
            <Button size="lg" className="h-16 w-full text-xl" onClick={() => dispatch({ type: 'reveal' })}>
              Show answer
            </Button>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <Button variant="forgot" size="lg" className="h-16 text-xl" disabled={busy} onClick={() => void answer('forgot')}>
                <Icon name="x" /> Forgot
              </Button>
              <Button variant="knew" size="lg" className="h-16 text-xl" disabled={busy} onClick={() => void answer('knew')}>
                <Icon name="check" /> Knew
              </Button>
            </div>
          )}
          <p className="mt-2 hidden text-center text-xs text-muted md:block">
            {state.revealed ? '← or 1: forgot · → or 2: knew · U: undo' : 'Space: show answer'}
          </p>
        </div>
      </div>
    </Shell>
  )
}
