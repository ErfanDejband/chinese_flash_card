import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { setLessonHidden } from '@/data/repositories/classStore'
import { deleteLesson, renameLesson } from '@/data/repositories/decks'
import { effectiveBox } from '@/domain/leitner/scheduler'
import type { StudyScope } from '@/domain/scope'
import { useDeck, useSettings } from '@/hooks/useDeck'
import { useDecks, useLessons } from '@/hooks/useDecks'
import { boxTone } from '@/ui/boxTones'
import { ButtonLink } from '@/ui/Button'
import { CardRow } from '@/ui/CardRow'
import { cn } from '@/ui/cn'
import { plural } from '@/ui/format'
import { Icon } from '@/ui/icons'
import { Loading } from '@/ui/Loading'
import { PageHeader } from '@/ui/PageHeader'
import { StudyPanel } from './DeckPage'
import { RemovePanel, TitleForm } from './parts'

export function LessonPage() {
  const { deckId = '', lessonId = '' } = useParams()
  const decks = useDecks()
  const lessons = useLessons(deckId)
  const entries = useDeck()
  const settings = useSettings()
  const navigate = useNavigate()
  const [mode, setMode] = useState<'view' | 'rename' | 'remove'>('view')
  if (!decks || !lessons || !entries || !settings) return <Loading />

  const deck = decks.find((d) => d.id === deckId)
  const lesson = lessons.find((l) => l.id === lessonId)
  if (!deck || !lesson) return <PageHeader title="Lesson not found" back={deck ? `/decks/${deck.id}` : '/decks'} />

  const config = settings.leitner
  const cards = entries.filter((e) => e.card.lessonId === lesson.id).sort((a, b) => a.card.createdAt - b.card.createdAt)
  const scope: StudyScope = { kind: 'deck', deckId: deck.id, lessonIds: [lesson.id] }
  const back = `/decks/${deck.id}`
  const boxOf = (box: number) => (box === 0 ? 0 : effectiveBox(box, config))
  const joined = !!deck.remote

  async function remove(keep: boolean) {
    await deleteLesson(lesson!.id, keep ? 'keep' : 'delete')
    navigate(back)
  }

  return (
    <>
      <PageHeader
        back={back}
        title={lesson.title}
        subtitle={`${deck.title} · ${plural(cards.length, 'card')}`}
        actions={
          <div className={joined ? 'hidden' : '-mr-2 flex'}>
            <button type="button" onClick={() => setMode('rename')} className="grid size-10 place-items-center rounded-full text-muted hover:bg-sunken" aria-label="Rename the lesson" title="Rename">
              <Icon name="pencil" className="size-5" />
            </button>
            <button type="button" onClick={() => setMode('remove')} className="grid size-10 place-items-center rounded-full text-muted hover:bg-sunken" aria-label="Delete the lesson" title="Delete">
              <Icon name="trash" className="size-5" />
            </button>
          </div>
        }
      />

      {mode === 'rename' && (
        <div className="mb-4">
          <TitleForm initial={lesson.title} placeholder="Lesson name" submit="Save" onSubmit={(t) => void renameLesson(lesson.id, t).then(() => setMode('view'))} onCancel={() => setMode('view')} />
        </div>
      )}
      {mode === 'remove' && (
        <div className="mb-4">
          <RemovePanel what={`“${lesson.title}”`} cards={cards.length} keepLabel="Keep them in the deck" onRemove={(keep) => void remove(keep)} onCancel={() => setMode('view')} />
        </div>
      )}

      <StudyPanel scope={scope} from={`${back}/${lesson.id}`} what="this lesson" />

      {!joined && (
        <ButtonLink to={`/import?deck=${deck.id}&lesson=${lesson.id}`} variant="secondary" className="mt-4 w-full">
          <Icon name="plus" /> Add cards to this lesson
        </ButtonLink>
      )}
      {!joined && (
        <label className="mt-3 flex items-start gap-3 text-sm">
          <input type="checkbox" className="mt-0.5 size-4" checked={!!lesson.hidden} onChange={(e) => void setLessonHidden(lesson.id, e.target.checked)} />
          <span>
            <span className="font-medium">Hide from students</span>
            <span className="block text-muted">
              {deck.share ? 'When you publish, students don’t see this lesson (those who have it lose it).' : 'If you share this deck as a class, this lesson stays out until you show it.'}
            </span>
          </span>
        </label>
      )}

      {cards.length === 0 ? (
        <p className="py-10 text-center text-muted">No cards in this lesson yet.</p>
      ) : (
        <ul className="-mx-2 mt-6">
          {cards.map(({ card, state }) => (
            <CardRow
              key={card.id}
              card={card}
              trailing={
                <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold', boxTone(boxOf(state.box), config.boxes.length).badge)}>
                  {state.box === 0 ? 'New' : boxOf(state.box)}
                </span>
              }
            />
          ))}
        </ul>
      )}
    </>
  )
}
