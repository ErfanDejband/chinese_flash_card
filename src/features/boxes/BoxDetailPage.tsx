import { useParams } from 'react-router'
import { newCardPool, summarizeDeck } from '@/domain/deck'
import { effectiveBox, intervalDays } from '@/domain/leitner/scheduler'
import { useDeck, useSettings } from '@/hooks/useDeck'
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
  const deck = useDeck()
  const settings = useSettings()
  const today = useToday()
  if (!deck || !settings) return <Loading />

  const config = settings.leitner
  if (!Number.isInteger(box) || box < 0 || box > config.boxes.length) {
    return <PageHeader title="No such box" back="/" />
  }

  const summary = summarizeDeck(deck, today, config, settings.newPerDay)
  const entries =
    box === 0
      ? newCardPool(deck)
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
        <ButtonLink to={`/review?new=${learnCount}`} size="lg" className="mb-6 w-full">
          Learn {plural(learnCount, 'new card')}
        </ButtonLink>
      )}
      {box > 0 && due > 0 && (
        <ButtonLink to={`/review?box=${box}`} size="lg" className="mb-6 w-full">
          Review {due} due
        </ButtonLink>
      )}

      {entries.length === 0 ? (
        <p className="py-8 text-center text-muted">This box is empty.</p>
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
