import { Link } from 'react-router'
import { useClassNews, useDecks } from '@/hooks/useDecks'

/** On Home: a joined class has new lessons from the teacher. */
export function ClassNewsBanner() {
  const news = useClassNews()
  const decks = useDecks()
  const items = (decks ?? []).flatMap((d) => {
    const lessons = news[d.id]?.newLessons ?? []
    return d.remote && lessons.length ? [{ deck: d, lessons }] : []
  })
  if (!items.length) return null
  return (
    <div className="mb-4 flex flex-col gap-2">
      {items.map(({ deck, lessons }) => (
        <Link key={deck.id} to={`/decks/${deck.id}`} className="flex items-center gap-3 rounded-2xl border border-accent/40 bg-surface px-4 py-3 text-sm hover:bg-sunken">
          <span className="text-xl" aria-hidden="true">
            🏫
          </span>
          <span className="min-w-0 flex-1">
            <span className="font-semibold">{deck.title}</span> has {lessons.length === 1 ? `a new lesson: ${lessons[0]!.title}` : `${lessons.length} new lessons`}
          </span>
          <span className="shrink-0 font-semibold text-accent">Add →</span>
        </Link>
      ))}
    </div>
  )
}
