import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { createDeck, moveDeck } from '@/data/repositories/decks'
import { MY_CARDS } from '@/domain/library'
import type { Deck } from '@/domain/types'
import { useDeck, useSettings } from '@/hooks/useDeck'
import { useDecks, useLessons } from '@/hooks/useDecks'
import { useToday } from '@/hooks/useToday'
import { Button, ButtonLink } from '@/ui/Button'
import { plural } from '@/ui/format'
import { Icon } from '@/ui/icons'
import { Loading } from '@/ui/Loading'
import { PageHeader } from '@/ui/PageHeader'
import { toStudy } from './counts'
import { TitleForm } from './parts'

export function StudyBadge({ count }: { count: number }) {
  if (count === 0) return null
  return <span className="shrink-0 rounded-full bg-accent px-2 py-0.5 text-xs font-bold text-on-accent tabular-nums">{count}</span>
}

function DeckRow({ deck, lessons, cards, study, first, last }: { deck: Deck; lessons: number; cards: number; study: number; first: boolean; last: boolean }) {
  return (
    <li className="flex items-center gap-1 pr-2 hover:bg-sunken">
      <Link to={`/decks/${deck.id}`} className="flex min-w-0 flex-1 items-center gap-4 py-4 pl-5">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent/10 text-accent">
          <Icon name="decks" className="size-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{deck.title}</span>
          <span className="block truncate text-sm text-muted">
            {lessons > 0 ? `${plural(lessons, 'lesson')} · ` : ''}
            {plural(cards, 'card')}
          </span>
        </span>
        <StudyBadge count={study} />
      </Link>
      <div className="flex flex-col">
        <button type="button" disabled={first} onClick={() => void moveDeck(deck.id, -1)} className="grid size-7 place-items-center rounded-full text-muted hover:bg-line disabled:invisible" aria-label={`Move ${deck.title} up`}>
          <Icon name="arrowUp" className="size-4" />
        </button>
        <button type="button" disabled={last} onClick={() => void moveDeck(deck.id, 1)} className="grid size-7 place-items-center rounded-full text-muted hover:bg-line disabled:invisible" aria-label={`Move ${deck.title} down`}>
          <Icon name="arrowDown" className="size-4" />
        </button>
      </div>
    </li>
  )
}

/** The Decks tab: your decks and their lessons, plus the ways to add cards. */
export function DecksPage() {
  const decks = useDecks()
  const lessons = useLessons()
  const entries = useDeck()
  const settings = useSettings()
  const today = useToday()
  const navigate = useNavigate()
  const [adding, setAdding] = useState(false)
  if (!decks || !lessons || !entries || !settings) return <Loading />

  const cardsIn = (deckId: string) => entries.filter((e) => e.card.deckId === deckId).length
  const myCards = cardsIn(MY_CARDS)

  async function add(title: string) {
    const deck = await createDeck(title)
    navigate(`/decks/${deck.id}`)
  }

  return (
    <>
      <PageHeader title="Decks" subtitle="Group your cards into decks and lessons" />

      <div className="mb-6 flex flex-col gap-3 sm:flex-row">
        <ButtonLink to="/import" size="lg" className="sm:flex-1">
          <Icon name="plus" /> Add cards
        </ButtonLink>
      </div>

      <section>
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-lg font-semibold">Your decks</h2>
          {decks.length > 0 && !adding && (
            <Button variant="ghost" size="sm" onClick={() => setAdding(true)}>
              <Icon name="plus" className="size-4" /> New deck
            </Button>
          )}
        </div>

        {adding && (
          <div className="mb-3">
            <TitleForm placeholder="Deck name, e.g. Book 2 or Chinese 101" submit="Create" onSubmit={(t) => void add(t)} onCancel={() => setAdding(false)} />
          </div>
        )}

        {decks.length === 0 && !adding ? (
          <div className="rounded-3xl border border-dashed border-line px-5 py-6 text-center">
            <p className="mx-auto max-w-md text-muted">
              A deck groups cards: a textbook, a class, a topic. Split it into lessons, then review one deck or one lesson at a time.
            </p>
            <Button className="mt-4" onClick={() => setAdding(true)}>
              <Icon name="plus" /> New deck
            </Button>
            <p className="mt-4 text-sm">
              <Link to="/help?topic=teachers" className="font-semibold text-accent">
                Teaching a class? Put each lesson in a deck →
              </Link>
            </p>
          </div>
        ) : (
          decks.length > 0 && (
            <ul className="divide-y divide-line overflow-hidden rounded-3xl border border-line bg-surface">
              {decks.map((d, i) => (
                <DeckRow
                  key={d.id}
                  deck={d}
                  lessons={lessons.filter((l) => l.deckId === d.id).length}
                  cards={cardsIn(d.id)}
                  study={toStudy(entries, d.id, today, settings)}
                  first={i === 0}
                  last={i === decks.length - 1}
                />
              ))}
            </ul>
          )
        )}
      </section>

      <Link to={`/cards?deck=${MY_CARDS}`} className="mt-4 flex items-center gap-4 rounded-3xl border border-line bg-surface px-5 py-4 hover:bg-sunken">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-sunken text-muted">
          <Icon name="cards" className="size-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">My cards</span>
          <span className="block truncate text-sm text-muted">{plural(myCards, 'card')} not in a deck</span>
        </span>
        <StudyBadge count={toStudy(entries, MY_CARDS, today, settings)} />
        <Icon name="chevron" className="size-5 shrink-0 text-muted" />
      </Link>
    </>
  )
}
