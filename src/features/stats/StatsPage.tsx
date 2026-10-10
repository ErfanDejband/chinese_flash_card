import type { ReactNode } from 'react'
import { summarizeDeck } from '@/domain/deck'
import { boxHistory, mostForgotten, periodSummary, type PeriodStats } from '@/domain/stats'
import { useDeck, useSettings } from '@/hooks/useDeck'
import { useStatsData } from '@/hooks/useStats'
import { useToday } from '@/hooks/useToday'
import { ButtonLink } from '@/ui/Button'
import { CardRow } from '@/ui/CardRow'
import { plural } from '@/ui/format'
import { Loading } from '@/ui/Loading'
import { PageHeader } from '@/ui/PageHeader'
import { REVIEW_MODE_INFO } from '@/ui/reviewModes'
import { ActivityCalendar } from './ActivityCalendar'
import { BoxHistoryChart } from './BoxHistoryChart'

const FORGOTTEN_SHOWN = 10

function Section({ title, note, children }: { title: string; note?: ReactNode; children: ReactNode }) {
  return (
    <section className="mt-8">
      <div className="mb-3">
        <h2 className="text-lg font-semibold">{title}</h2>
        {note && <p className="text-sm text-muted">{note}</p>}
      </div>
      {children}
    </section>
  )
}

/** "↑ 12", "↓ 3", "same"; arrows carry the direction, not colour. */
function delta(current: number | null, previous: number | null, unit = ''): string {
  if (current === null || previous === null) return 'no data the week before'
  const d = current - previous
  if (d === 0) return 'same as the week before'
  return `${d > 0 ? '↑' : '↓'} ${Math.abs(d)}${unit} vs the week before`
}

function Tile({ label, value, change }: { label: string; value: string; change: string }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-3">
      <div className="text-3xl font-bold tabular-nums">{value}</div>
      <div className="text-sm font-medium">{label}</div>
      <div className="mt-1 text-xs text-muted">{change}</div>
    </div>
  )
}

function PeriodTiles({ current, previous }: { current: PeriodStats; previous: PeriodStats }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Tile label="Reviews" value={String(current.reviews)} change={delta(current.reviews, previous.reviews)} />
      <Tile
        label="Known first time"
        value={current.knewPct === null ? '–' : `${current.knewPct}%`}
        change={delta(current.knewPct, previous.knewPct, ' pts')}
      />
      <Tile label="New cards" value={String(current.newCards)} change={delta(current.newCards, previous.newCards)} />
      <Tile label="Days studied" value={`${current.daysStudied}/7`} change={delta(current.daysStudied, previous.daysStudied)} />
    </div>
  )
}

export function StatsPage() {
  const data = useStatsData()
  const settings = useSettings()
  const deck = useDeck()
  const today = useToday()
  if (!data || !settings || !deck) return <Loading />

  const mode = settings.reviewMode
  const direction = REVIEW_MODE_INFO[mode].label
  const header = <PageHeader title="Stats" back="/" subtitle="Your progress over time, on this device" />

  if (data.log.length === 0) {
    return (
      <>
        {header}
        <div className="py-10 text-center">
          <div className="mb-3 text-5xl">📈</div>
          <p className="mx-auto mb-6 max-w-sm text-muted">Review some cards and your streak, activity and progress through the boxes appear here.</p>
          <ButtonLink to="/review" size="lg">
            Start review
          </ButtonLink>
        </div>
      </>
    )
  }

  const { current, best, reviewedToday } = data.streak
  const period = periodSummary(data.log, today)
  const history = boxHistory(data.log, mode, data.cards, settings.leitner, today)
  const pool = summarizeDeck(deck, today, settings.leitner, settings.newPerDay).notStarted
  const cardById = new Map(data.cards.map((c) => [c.id, c]))
  const forgotten = mostForgotten(data.log, mode)
    .filter((f) => {
      const card = cardById.get(f.cardId)
      return card !== undefined && card.deletedAt === undefined
    })
    .slice(0, FORGOTTEN_SHOWN)

  return (
    <>
      {header}

      <section className="rounded-3xl border border-line bg-surface p-5 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-5xl font-bold tracking-tight tabular-nums">
              <span aria-hidden="true">🔥 </span>
              {current}
            </div>
            <div className="text-muted">{current === 1 ? 'day' : 'days'} in a row</div>
          </div>
          <div className="text-right text-sm">
            <div>Best: {plural(best, 'day')}</div>
            <div className="text-muted">
              {reviewedToday ? 'Reviewed today ✓' : current > 0 ? 'Review today to keep it going' : 'Review today to start one'}
            </div>
          </div>
        </div>
        <ActivityCalendar activity={data.activity} today={today} />
      </section>

      <Section title="Last 7 days" note="Both directions; “known first time” counts each card’s first answer of the day.">
        <PeriodTiles {...period} />
      </Section>

      <Section title="Boxes over time" note={`${direction}: started cards at the end of each week.`}>
        <BoxHistoryChart history={history} />
        {pool > 0 && <p className="mt-2 text-sm text-muted">+ {plural(pool, 'card')} still waiting in the new-card pool.</p>}
      </Section>

      <Section title="Most forgotten" note={`${direction}: tap a card to add a note or a picture that helps.`}>
        {forgotten.length === 0 ? (
          <p className="text-muted">Nothing forgotten yet 🎉</p>
        ) : (
          <ul className="-mx-2">
            {forgotten.map((f) => (
              <CardRow
                key={f.cardId}
                card={cardById.get(f.cardId)!}
                trailing={<span className="shrink-0 text-sm text-muted tabular-nums">forgot {f.forgot}×</span>}
              />
            ))}
          </ul>
        )}
      </Section>
    </>
  )
}
