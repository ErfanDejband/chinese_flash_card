import { useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { createLesson, deleteDeck, moveLesson, updateDeck } from '@/data/repositories/decks'
import { summarizeDeck } from '@/domain/deck'
import { scopedLink, type StudyScope } from '@/domain/scope'
import type { Lesson } from '@/domain/types'
import { useDeck, useSettings } from '@/hooks/useDeck'
import { useDecks, useLessons, useStudyScope } from '@/hooks/useDecks'
import { useToday } from '@/hooks/useToday'
import { saveStudyScope } from '@/lib/studyScope'
import { Button, ButtonLink } from '@/ui/Button'
import { plural } from '@/ui/format'
import { Icon } from '@/ui/icons'
import { Loading } from '@/ui/Loading'
import { PageHeader } from '@/ui/PageHeader'
import { toStudy } from './counts'
import { StudyBadge } from './DecksPage'
import { RemovePanel, TitleForm } from './parts'

const EXTRA_NEW = 5

/** Review now, or learn a few new cards when nothing is due; sessions come back to `from`. */
export function StudyPanel({ scope, from, what, actions }: { scope: StudyScope; from: string; what: string; actions?: ReactNode }) {
  const entries = useDeck()
  const settings = useSettings()
  const today = useToday()
  if (!entries || !settings) return null
  const s = summarizeDeck(entries, today, settings.leitner, settings.newPerDay, scope)
  const count = s.due + s.newToday
  const extra = Math.min(s.notStarted, EXTRA_NEW)
  const state = { from }
  return (
    <section className="rounded-3xl border border-line bg-surface p-4 shadow-sm">
      {count > 0 ? (
        <>
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-2xl font-bold tabular-nums">{count}</span>
            <span className="font-medium">to study today</span>
            <span className="text-sm text-muted">
              · {s.due} due · {s.newToday} new
            </span>
          </div>
          <ButtonLink to={scopedLink('/review', scope)} state={state} size="lg" className="mt-3 w-full">
            Review {what}
          </ButtonLink>
        </>
      ) : (
        <>
          <div className="font-semibold">{s.total === 0 ? 'No cards yet' : `Nothing due in ${what} today`}</div>
          {extra > 0 && (
            <Link to={scopedLink('/review', scope, [['new', String(extra)]])} state={state} className="mt-1 inline-block text-sm font-semibold text-accent">
              Learn {plural(extra, 'new card')} →
            </Link>
          )}
        </>
      )}
      {actions}
    </section>
  )
}

function LessonRow({ lesson, cards, study, first, last }: { lesson: Lesson; cards: number; study: number; first: boolean; last: boolean }) {
  return (
    <li className="flex items-center gap-1 pr-2 hover:bg-sunken">
      <Link to={`/decks/${lesson.deckId}/${lesson.id}`} className="flex min-w-0 flex-1 items-center gap-3 py-3 pl-5">
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{lesson.title}</span>
          <span className="block text-sm text-muted">{plural(cards, 'card')}</span>
        </span>
        <StudyBadge count={study} />
      </Link>
      <div className="flex flex-col">
        <button type="button" disabled={first} onClick={() => void moveLesson(lesson.id, -1)} className="grid size-7 place-items-center rounded-full text-muted hover:bg-line disabled:invisible" aria-label={`Move ${lesson.title} up`}>
          <Icon name="arrowUp" className="size-4" />
        </button>
        <button type="button" disabled={last} onClick={() => void moveLesson(lesson.id, 1)} className="grid size-7 place-items-center rounded-full text-muted hover:bg-line disabled:invisible" aria-label={`Move ${lesson.title} down`}>
          <Icon name="arrowDown" className="size-4" />
        </button>
      </div>
    </li>
  )
}

export function DeckPage() {
  const { deckId = '' } = useParams()
  const decks = useDecks()
  const lessons = useLessons(deckId)
  const entries = useDeck()
  const settings = useSettings()
  const today = useToday()
  const homeScope = useStudyScope()
  const navigate = useNavigate()
  const [mode, setMode] = useState<'view' | 'rename' | 'remove' | 'lesson'>('view')
  if (!decks || !lessons || !entries || !settings || !homeScope) return <Loading />

  const deck = decks.find((d) => d.id === deckId)
  if (!deck) return <PageHeader title="Deck not found" back="/decks" />

  const cards = entries.filter((e) => e.card.deckId === deck.id)
  const lessonIds = new Set(lessons.map((l) => l.id))
  const loose = cards.filter((e) => !e.card.lessonId || !lessonIds.has(e.card.lessonId)).length
  const scope: StudyScope = { kind: 'deck', deckId: deck.id }
  const onHome = homeScope.kind === 'deck' && homeScope.deckId === deck.id
  const here = `/decks/${deck.id}`

  async function remove(keep: boolean) {
    await deleteDeck(deck!.id, keep ? 'keep' : 'delete')
    navigate('/decks')
  }

  return (
    <>
      <PageHeader
        back="/decks"
        title={deck.title}
        subtitle={`${lessons.length > 0 ? `${plural(lessons.length, 'lesson')} · ` : ''}${plural(cards.length, 'card')}`}
        actions={
          <div className="-mr-2 flex">
            <button type="button" onClick={() => setMode('rename')} className="grid size-10 place-items-center rounded-full text-muted hover:bg-sunken" aria-label="Rename the deck" title="Rename">
              <Icon name="pencil" className="size-5" />
            </button>
            <button type="button" onClick={() => setMode('remove')} className="grid size-10 place-items-center rounded-full text-muted hover:bg-sunken" aria-label="Delete the deck" title="Delete">
              <Icon name="trash" className="size-5" />
            </button>
          </div>
        }
      />

      {mode === 'rename' && (
        <div className="mb-4">
          <TitleForm initial={deck.title} placeholder="Deck name" submit="Save" onSubmit={(t) => void updateDeck(deck.id, { title: t }).then(() => setMode('view'))} onCancel={() => setMode('view')} />
        </div>
      )}
      {mode === 'remove' && (
        <div className="mb-4">
          <RemovePanel what={`“${deck.title}”`} cards={cards.length} keepLabel="Keep them in My cards" onRemove={(keep) => void remove(keep)} onCancel={() => setMode('view')} />
        </div>
      )}

      <StudyPanel
        scope={scope}
        from={here}
        what="this deck"
        actions={
          <button
            type="button"
            onClick={() => saveStudyScope(scope)}
            disabled={onHome}
            className="mt-3 flex items-center gap-1.5 text-sm font-medium text-muted enabled:hover:text-ink"
          >
            {onHome ? (
              <>
                <Icon name="check" className="size-4 text-accent" /> Home reviews this deck
              </>
            ) : (
              'Review this deck from Home'
            )}
          </button>
        }
      />

      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <ButtonLink to={`/import?deck=${deck.id}`} variant="secondary" className="flex-1">
          <Icon name="plus" /> Add cards
        </ButtonLink>
        <ButtonLink to={`/cards?deck=${deck.id}`} variant="secondary" className="flex-1">
          <Icon name="cards" /> All its cards
        </ButtonLink>
      </div>

      <section className="mt-8">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-lg font-semibold">Lessons</h2>
          {mode !== 'lesson' && (
            <Button variant="ghost" size="sm" onClick={() => setMode('lesson')}>
              <Icon name="plus" className="size-4" /> New lesson
            </Button>
          )}
        </div>
        {mode === 'lesson' && (
          <div className="mb-3">
            <TitleForm
              placeholder={`Lesson name, e.g. Lesson ${lessons.length + 1}`}
              submit="Add"
              onSubmit={(t) => void createLesson(deck.id, t).then(() => setMode('view'))}
              onCancel={() => setMode('view')}
            />
          </div>
        )}
        {lessons.length === 0 ? (
          <p className="text-sm text-muted">
            Split the deck into lessons to review them one at a time. A word list with a Lesson column makes them for you.{' '}
            <Link to="/help?topic=teachers" className="font-semibold text-accent">
              How →
            </Link>
          </p>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-3xl border border-line bg-surface">
            {lessons.map((l, i) => (
              <LessonRow
                key={l.id}
                lesson={l}
                cards={cards.filter((e) => e.card.lessonId === l.id).length}
                study={toStudy(entries, deck.id, today, settings, [l.id])}
                first={i === 0}
                last={i === lessons.length - 1}
              />
            ))}
          </ul>
        )}
        {lessons.length > 0 && loose > 0 && (
          <Link to={`/cards?deck=${deck.id}&lesson=none`} className="mt-3 block text-sm text-muted hover:text-ink">
            {plural(loose, 'card')} not in a lesson →
          </Link>
        )}
      </section>
    </>
  )
}
