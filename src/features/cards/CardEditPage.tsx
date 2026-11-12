import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router'
import { deleteCard, getCard } from '@/data/repositories/cards'
import { getReviewState } from '@/data/repositories/review'
import { getSettings } from '@/data/repositories/settings'
import type { Card, ReviewState } from '@/domain/types'
import { useToday } from '@/hooks/useToday'
import { boxLabel } from '@/ui/boxTones'
import { Button } from '@/ui/Button'
import { plural, relativeDay, shortDateTime } from '@/ui/format'
import { Hanzi } from '@/ui/Hanzi'
import { Icon } from '@/ui/icons'
import { Loading } from '@/ui/Loading'
import { PageHeader } from '@/ui/PageHeader'
import { reviewModeInfo } from '@/ui/reviewModes'
import { targetFromParams, targetQuery } from '@/features/decks/target'
import { useSettings } from '@/hooks/useDeck'
import { useDecks } from '@/hooks/useDecks'
import { ExampleSentence } from '@/ui/ExampleSentence'
import { MediaImage } from '@/ui/MediaImage'
import { Reading } from '@/ui/Reading'
import { CardForm } from './CardForm'

function Progress({ card, state, fromClass }: { card: Card; state?: ReviewState; fromClass?: string }) {
  const today = useToday()
  const settings = useSettings()
  const source =
    card.source.type === 'pdf'
      ? `Imported from ${card.source.fileName}, page ${card.source.page}`
      : card.source.type === 'image'
        ? `Imported from ${card.source.fileName}`
        : fromClass
          ? `Added from the class “${fromClass}”`
          : 'Added manually'
  return (
    <div className="mb-6 rounded-2xl border border-line bg-surface p-4 text-sm text-muted">
      {settings && <p className="mb-1 text-xs font-semibold tracking-wide uppercase">{reviewModeInfo(settings.reviewMode).label}</p>}
      {state && state.box > 0 ? (
        <p>
          <span className="font-semibold text-ink">{boxLabel(state.box)}</span>
          {state.dueOn && <> · next review {state.dueOn <= today ? 'today' : relativeDay(state.dueOn, today)}</>} · reviewed{' '}
          {plural(state.reviewCount, 'time')}
          {state.lapseCount > 0 && <> · forgotten {plural(state.lapseCount, 'time')}</>}
        </p>
      ) : (
        <p>
          <span className="font-semibold text-ink">Not started</span> · waiting in the new-card pool
        </p>
      )}
      <p className="mt-1">
        {source} on {shortDateTime(card.createdAt)}
      </p>
    </div>
  )
}

/** A card of a joined class: shown, not edited (the teacher's updates would overwrite edits). */
function ClassCardView({ card, deckTitle, teacher }: { card: Card; deckTitle: string; teacher?: string }) {
  return (
    <section className="rounded-3xl border border-line bg-surface p-5">
      <p className="mb-4 rounded-xl bg-sunken px-3 py-2 text-sm text-muted">
        From {teacher ? `${teacher}’s` : 'your teacher’s'} class “{deckTitle}”. Your teacher keeps this card up to date, so it can’t be edited here; you can remove it for yourself.
      </p>
      {card.imageId && <MediaImage id={card.imageId} alt="" className="mb-4 max-h-56 w-full rounded-2xl p-2" />}
      <Hanzi className="block text-5xl">{card.hanzi}</Hanzi>
      <Reading pinyin={card.pinyin} hanzi={card.hanzi} className="mt-1 block text-xl text-accent" />
      {card.meaning && <p className="mt-2 text-lg">{card.meaning}</p>}
      {card.example && <ExampleSentence example={card.example} word={card.hanzi} className="mt-3" />}
      {card.notes && <p className="mt-3 text-sm whitespace-pre-line text-muted">{card.notes}</p>}
    </section>
  )
}

export function CardEditPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const [formKey, setFormKey] = useState(0)
  const [flash, setFlash] = useState<string>()
  const [params, setParams] = useSearchParams()
  const decks = useDecks()

  // undefined = loading, null = not found
  const card = useLiveQuery(async () => (id ? ((await getCard(id)) ?? null) : null), [id])
  // Progress in the practice direction currently chosen in Settings.
  const state = useLiveQuery(async () => (id ? getReviewState(id, (await getSettings()).reviewMode) : undefined), [id])

  const goBack = () => (location.key !== 'default' ? navigate(-1) : navigate('/cards', { replace: true }))

  if (id && card === undefined) return <Loading />
  if (id && card === null) {
    return (
      <>
        <PageHeader title="Card not found" back="/cards" />
        <p className="text-muted">It may have been deleted.</p>
      </>
    )
  }

  const existing = card ?? undefined
  const classDeck = existing && decks?.find((d) => d.id === existing.deckId && d.remote)

  async function remove() {
    if (!existing || !confirm(classDeck ? `Remove “${existing.hanzi}” for yourself? It won’t come back with the class’s updates.` : `Delete “${existing.hanzi}”? Its review progress is removed too.`)) return
    await deleteCard(existing.id)
    goBack()
  }

  return (
    <>
      <PageHeader
        title={existing ? <Hanzi>{existing.hanzi}</Hanzi> : 'New card'}
        back="/cards"
        actions={
          existing && (
            <Button variant="ghost" className="text-red-600 dark:text-red-400" onClick={() => void remove()} aria-label={classDeck ? 'Remove the card for me' : 'Delete card'}>
              <Icon name="trash" className="size-5" />
            </Button>
          )
        }
      />
      {existing && <Progress card={existing} state={state} fromClass={classDeck ? classDeck.title : undefined} />}
      {flash && (
        <p className="mb-4 flex animate-reveal items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
          <Icon name="check" className="size-5" /> {flash}
        </p>
      )}
      {classDeck && existing ? (
        <ClassCardView card={existing} deckTitle={classDeck.title} teacher={classDeck.teacher} />
      ) : (
        <CardForm
          key={`${existing?.id ?? 'new'}-${formKey}`}
          card={existing}
          target={targetFromParams(params)}
          onTargetChange={(t) => setParams(targetQuery(t), { replace: true })}
          onSaved={(saved, addAnother) => {
            if (addAnother) {
              setFlash(`Saved ${saved.hanzi}. Add the next one.`)
              setFormKey((k) => k + 1)
              window.scrollTo({ top: 0 })
            } else {
              goBack()
            }
          }}
        />
      )}
    </>
  )
}
