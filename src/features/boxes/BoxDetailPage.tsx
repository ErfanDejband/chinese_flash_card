import { Link, useParams, useSearchParams } from 'react-router'
import { newCardPool, summarizeDeck } from '@/domain/deck'
import { inScope, parseScope, scopedLink } from '@/domain/scope'
import { effectiveBox, intervalDays } from '@/domain/leitner/scheduler'
import { lessonRanks } from '@/domain/library'
import { useDeck, useSettings } from '@/hooks/useDeck'
import { useDecks, useLessons } from '@/hooks/useDecks'
import { useToday } from '@/hooks/useToday'
import { boxLabel, boxTone } from '@/ui/boxTones'
import { ButtonLink } from '@/ui/Button'
import { CardRow } from '@/ui/CardRow'
import { cn } from '@/ui/cn'
import { plural, relativeDay } from '@/ui/format'
import { Loading } from '@/ui/Loading'
import { PageHeader } from '@/ui/PageHeader'

export function BoxDetailPage() {
  const box = Number(useParams().box)
  const [params] = useSearchParams()
  const scope = parseScope(params)
  const all = useDeck()
  const decks = useDecks()
  const lessons = useLessons()
  const settings = useSettings()
  const today = useToday()
  if (!all || !settings || !decks || !lessons) return <Loading />
  const deck = all.filter((e) => inScope(e.card, scope))

  const config = settings.leitner
  if (!Number.isInteger(box) || box < 0 || box > config.boxes.length) {
    return <PageHeader title="No such box" back="/" />
  }

  const summary = summarizeDeck(all, today, config, settings.newPerDay, scope)
  const entries =
    box === 0
      ? newCardPool(deck, lessonRanks(decks, lessons))
      : deck
          .filter((e) => e.state.box > 0 && effectiveBox(e.state.box, config) === box)
          .sort((a, b) => (a.state.dueOn ?? '').localeCompare(b.state.dueOn ?? ''))
  const due = box === 0 ? 0 : summary.boxes[box - 1]!.due
  const learnCount = summary.newToday > 0 ? summary.newToday : Math.min(entries.length, 5)
  const tone = boxTone(box, config.boxes.length)

  return (
    <>
      <PageHeader
        back="/"
        title={box === 0 ? 'New cards' : boxLabel(box)}
        subtitle={
          box === 0
            ? `Not started yet · up to ${settings.newPerDay} are introduced per day`
            : `Reviewed every ${plural(intervalDays(box, config), 'day')}`
        }
      />

      <div className="mb-6 flex items-center gap-3">
        <span className={cn('rounded-full px-3 py-1 text-sm font-semibold', tone.badge)}>{plural(entries.length, 'card')}</span>
        {box > 0 && <span className="rounded-full bg-sunken px-3 py-1 text-sm font-medium">{due} due today</span>}
      </div>

      {box === 0 && learnCount > 0 && (
        <ButtonLink to={scopedLink('/review', scope, [['new', String(learnCount)]])} size="lg" className="mb-6 w-full">
          Learn {plural(learnCount, 'new card')}
        </ButtonLink>
      )}
      {box > 0 && due > 0 && (
        <ButtonLink to={scopedLink('/review', scope, [['box', String(box)]])} size="lg" className="mb-6 w-full">
          Review {due} due
        </ButtonLink>
      )}

      {entries.length === 0 ? (
        <div className="py-8 text-center">
          <p className="mx-auto max-w-sm text-muted">
            {box === 0
              ? `No new cards waiting. Cards you add start here, and up to ${settings.newPerDay} a day are introduced.`
              : box === 1
                ? 'This box is empty. Forgotten cards come back here.'
                : `This box is empty. Cards you know in Box ${box - 1}${box === 2 ? ' (and new cards you already know)' : ''} move up here.`}
          </p>
          <Link to="/help?topic=boxes" className="mt-4 inline-block text-sm font-semibold text-accent">
            How the boxes work →
          </Link>
        </div>
      ) : (
        <ul className="-mx-2">
          {entries.map(({ card, state }) => (
            <CardRow
              key={card.id}
              card={card}
              trailing={
                state.dueOn && (
                  <span className={cn('shrink-0 text-xs', state.dueOn <= today ? 'font-semibold text-accent' : 'text-muted')}>
                    {state.dueOn <= today ? 'due' : relativeDay(state.dueOn, today)}
                  </span>
                )
              }
            />
          ))}
        </ul>
      )}
    </>
  )
}
