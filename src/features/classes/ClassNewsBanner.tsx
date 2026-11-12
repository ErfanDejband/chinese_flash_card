import { Link } from 'react-router'
import { useClassNews, useDecks } from '@/hooks/useDecks'
import { dismissStop } from '@/lib/classRunner'
import { Button } from '@/ui/Button'

/** On Home: a joined class has new lessons from the teacher, or the teacher stopped sharing it. */
export function ClassNewsBanner() {
  const news = useClassNews()
  const decks = useDecks()
  const joined = (decks ?? []).filter((d) => d.remote)
  const fresh = joined.flatMap((d) => {
    const lessons = news[d.id]?.newLessons ?? []
    return !d.remote!.stopped && lessons.length ? [{ deck: d, lessons }] : []
  })
  // The stop comes with the synced deck row, so each of the student's devices shows the note once.
  const stopped = joined.filter((d) => d.remote!.stopped && !news[d.id]?.stopSeen)
  if (!fresh.length && !stopped.length) return null
  return (
    <div className="mb-4 flex flex-col gap-2">
      {fresh.map(({ deck, lessons }) => (
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
      {stopped.map((deck) => (
        <div key={deck.id} className="flex items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 text-sm">
          <span className="text-xl" aria-hidden="true">
            🏫
          </span>
          <span className="min-w-0 flex-1">
            {deck.teacher ?? 'Your teacher'} stopped sharing <span className="font-semibold">“{deck.title}”</span>. You keep its cards; they just won’t get updates.
          </span>
          <Button size="sm" variant="secondary" onClick={() => dismissStop(deck.id)}>
            OK
          </Button>
        </div>
      ))}
    </div>
  )
}
