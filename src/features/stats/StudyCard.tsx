import { Link } from 'react-router'
import { nextDueDate, summarizeDeck, type DeckEntry } from '@/domain/deck'
import { inScope, scopedLink } from '@/domain/scope'
import type { AppSettings, LocalDate } from '@/domain/types'
import { ScopePicker } from '@/features/decks/parts'
import { useDecks, useLessons, useStudyScope } from '@/hooks/useDecks'
import { saveStudyScope } from '@/lib/studyScope'
import { ButtonLink } from '@/ui/Button'
import { plural, relativeDay } from '@/ui/format'

const EXTRA_NEW = 5
/** Sessions started here come back here (see ReviewPage). */
const FROM = { from: '/progress' }

/** Top of the Progress tab: start today's review, or what's next once it's done. */
export function StudyCard({ deck, settings, today, reviewedToday }: { deck: DeckEntry[]; settings: AppSettings; today: LocalDate; reviewedToday: boolean }) {
  const scope = useStudyScope()
  const decks = useDecks()
  const lessons = useLessons()
  if (!scope || !decks || !lessons) return null
  const s = summarizeDeck(deck, today, settings.leitner, settings.newPerDay, scope)
  const toStudy = s.due + s.newToday
  const picker = decks.length > 0 && (
    <div className="mb-3">
      <ScopePicker scope={scope} decks={decks} lessons={lessons} onChange={saveStudyScope} />
    </div>
  )

  if (toStudy > 0) {
    return (
      <section className="rounded-3xl border border-line bg-surface p-4 shadow-sm">
        {picker}
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-2xl font-bold tabular-nums">{toStudy}</span>
          <span className="font-medium">to study today</span>
          <span className="text-sm text-muted">
            · {s.due} due · {s.newToday} new
          </span>
        </div>
        <ButtonLink to={scopedLink('/review', scope)} state={FROM} size="lg" className="mt-3 w-full">
          Start review
        </ButtonLink>
      </section>
    )
  }

  const nextDue = nextDueDate(
    deck.filter((e) => inScope(e.card, scope)),
    today,
  )
  const extra = Math.min(s.notStarted, EXTRA_NEW)
  return (
    <section className="rounded-3xl border border-line bg-surface p-4 shadow-sm">
      {picker}
      <div className="text-lg font-semibold">{reviewedToday ? '✓ Reviewed today' : 'Nothing due today'}</div>
      <p className="text-sm text-muted">{nextDue ? `Next review ${relativeDay(nextDue, today)}.` : 'No reviews scheduled yet.'}</p>
      {extra > 0 && (
        <Link to={scopedLink('/review', scope, [['new', String(extra)]])} state={FROM} className="mt-2 inline-block text-sm font-semibold text-accent">
          Learn {plural(extra, 'more new card')} →
        </Link>
      )}
    </section>
  )
}
