import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { effectiveBox } from '@/domain/leitner/scheduler'
import { matchesQuery } from '@/domain/search'
import { useDeck, useSettings } from '@/hooks/useDeck'
import { boxLabel, boxTone } from '@/ui/boxTones'
import { Button } from '@/ui/Button'
import { CardRow } from '@/ui/CardRow'
import { cn } from '@/ui/cn'
import { AddCardFab } from '@/ui/Fab'
import { plural } from '@/ui/format'
import { Icon } from '@/ui/icons'
import { Loading } from '@/ui/Loading'
import { PageHeader } from '@/ui/PageHeader'

const PAGE = 100

export function CardsPage() {
  const deck = useDeck()
  const settings = useSettings()
  // Search state lives in the URL so it survives opening a card and coming back.
  const [params, setParams] = useSearchParams()
  const query = params.get('q') ?? ''
  const boxParam = params.get('box')
  const boxFilter = boxParam === null ? null : Number(boxParam)
  const [limit, setLimit] = useState(PAGE)

  if (!deck || !settings) return <Loading />
  const config = settings.leitner

  const update = (key: string, value: string | null) => {
    const next = new URLSearchParams(params)
    if (value === null || value === '') next.delete(key)
    else next.set(key, value)
    setParams(next, { replace: true })
    setLimit(PAGE)
  }

  const boxOf = (box: number) => (box === 0 ? 0 : effectiveBox(box, config))
  const results = deck
    .filter((e) => boxFilter === null || boxOf(e.state.box) === boxFilter)
    .filter((e) => matchesQuery(e.card, query))
    .sort((a, b) => b.card.createdAt - a.card.createdAt)

  const filters: (number | null)[] = [null, 0, ...config.boxes.map((_, i) => i + 1)]

  return (
    <>
      <PageHeader title="Cards" subtitle={plural(deck.length, 'card')} />

      <div className="sticky top-0 z-10 -mx-4 bg-paper/95 px-4 pb-3 backdrop-blur md:top-16">
        <label className="relative block">
          <Icon name="search" className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted" />
          <input
            type="search"
            value={query}
            onChange={(e) => update('q', e.target.value)}
            placeholder="Search characters, pinyin, meaning"
            className="h-12 w-full rounded-xl border border-line bg-surface pr-3 pl-10 outline-none focus:border-accent"
          />
        </label>
        <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4" role="group" aria-label="Filter by box">
          {filters.map((f) => (
            <button
              key={f ?? 'all'}
              type="button"
              onClick={() => update('box', f === null ? null : String(f))}
              className={cn(
                'h-9 shrink-0 rounded-full border px-4 text-sm font-medium',
                boxFilter === f ? 'border-transparent bg-ink text-paper' : 'border-line bg-surface text-muted',
              )}
            >
              {f === null ? 'All' : boxLabel(f)}
            </button>
          ))}
        </div>
      </div>

      {results.length === 0 ? (
        <p className="py-12 text-center text-muted">{query || boxFilter !== null ? 'No matching cards.' : 'No cards yet.'}</p>
      ) : (
        <ul className="-mx-2">
          {results.slice(0, limit).map(({ card, state }) => (
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
      {results.length > limit && (
        <Button variant="secondary" className="mt-4 w-full" onClick={() => setLimit(limit + PAGE)}>
          Show more ({results.length - limit} left)
        </Button>
      )}

      <AddCardFab />
    </>
  )
}
