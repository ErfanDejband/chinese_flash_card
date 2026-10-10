import type { ReactNode } from 'react'
import { nextDueDate, summarizeDeck } from '@/domain/deck'
import { BoxesView } from '@/features/boxes/BoxesView'
import { useDeck, useSettings } from '@/hooks/useDeck'
import { useStatsData } from '@/hooks/useStats'
import { useToday } from '@/hooks/useToday'
import { ButtonLink } from '@/ui/Button'
import { AddCardFab } from '@/ui/Fab'
import { longDate, plural, relativeDay } from '@/ui/format'
import { Hanzi } from '@/ui/Hanzi'
import { Icon } from '@/ui/icons'
import { Loading } from '@/ui/Loading'
import { PageHeader } from '@/ui/PageHeader'
import { REVIEW_MODE_INFO } from '@/ui/reviewModes'
import { Link } from 'react-router'

const EXTRA_NEW = 5

function Welcome() {
  return (
    <div className="py-10 text-center">
      <Hanzi className="mb-4 block text-7xl text-accent">學</Hanzi>
      <h1 className="mb-2 text-2xl font-bold">Welcome to Mandarin Leitner</h1>
      <p className="mx-auto mb-8 max-w-sm text-muted">
        Add vocabulary cards, then review a little every day. Cards you know move up through the boxes and come back less often.
      </p>
      <div className="mx-auto flex max-w-xs flex-col gap-3">
        <ButtonLink to="/cards/new" size="lg">
          <Icon name="plus" /> Add your first card
        </ButtonLink>
        <ButtonLink to="/import" variant="secondary" size="lg">
          <Icon name="import" /> Import from PDF
        </ButtonLink>
      </div>
    </div>
  )
}

function Pill({ children }: { children: ReactNode }) {
  return <span className="rounded-full bg-sunken px-3 py-1 text-sm font-medium">{children}</span>
}

/** Streak at a glance; the whole strip opens the Progress tab. */
function StreakStrip() {
  const stats = useStatsData()
  if (!stats) return null
  const { current, best, reviewedToday } = stats.streak
  const text =
    current === 0 ? 'Start a streak today' : `🔥 ${current}-day streak${reviewedToday ? '' : ' — review today to keep it'}`
  return (
    <Link to="/progress" className="mb-4 flex items-center gap-3 rounded-2xl bg-sunken px-4 py-2.5 text-sm hover:bg-line">
      <span className="min-w-0 flex-1 truncate font-medium">
        {text}
        {best > current && <span className="font-normal text-muted"> · best {best}</span>}
      </span>
      <span className="shrink-0 font-semibold text-accent">Progress →</span>
    </Link>
  )
}

export function DashboardPage() {
  const deck = useDeck()
  const settings = useSettings()
  const today = useToday()
  if (!deck || !settings) return <Loading />
  if (deck.length === 0) return <Welcome />

  const s = summarizeDeck(deck, today, settings.leitner, settings.newPerDay)
  const toStudy = s.due + s.newToday
  const nextDue = nextDueDate(deck, today)
  const extra = Math.min(s.notStarted, EXTRA_NEW)
  const lastBox = s.boxes[s.boxes.length - 1]

  return (
    <>
      <PageHeader
        title="Today"
        subtitle={
          <>
            {longDate(today)} · {REVIEW_MODE_INFO[settings.reviewMode].label}{' '}
            <Link to="/settings" className="text-accent underline">
              change
            </Link>
          </>
        }
      />

      <StreakStrip />

      <section className="rounded-3xl border border-line bg-surface p-5 shadow-sm">
        {toStudy > 0 ? (
          <>
            <div className="text-6xl font-bold tracking-tight tabular-nums">{toStudy}</div>
            <div className="text-muted">{toStudy === 1 ? 'card' : 'cards'} to study today</div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Pill>{s.due} due</Pill>
              <Pill>{s.newToday} new</Pill>
            </div>
            <ButtonLink to="/review" size="lg" className="mt-5 w-full">
              Start review
            </ButtonLink>
          </>
        ) : (
          <>
            <div className="text-2xl font-bold">All done for today 🎉</div>
            <p className="mt-1 text-muted">
              {nextDue ? `Next review ${relativeDay(nextDue, today)}.` : 'No reviews scheduled yet.'}
            </p>
            {extra > 0 && (
              <ButtonLink to={`/review?new=${extra}`} variant="secondary" className="mt-5 w-full">
                Learn {plural(extra, 'more new card')}
              </ButtonLink>
            )}
          </>
        )}
      </section>

      <section className="mt-8">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-lg font-semibold">Your boxes</h2>
          <span className="text-sm text-muted">{plural(s.total, 'card')}</span>
        </div>
        <BoxesView notStarted={s.notStarted} boxes={s.boxes} />
        {lastBox && lastBox.total > 0 && (
          <p className="mt-4 text-sm text-muted">
            {plural(lastBox.total, 'card')} in the top box — well learned.
          </p>
        )}
      </section>

      <AddCardFab />
    </>
  )
}
