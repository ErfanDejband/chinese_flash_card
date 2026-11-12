import { useState } from 'react'
import { Link } from 'react-router'
import { ClassError, openBody } from '@/classes/format'
import { openClass, takeLessons } from '@/classes/join'
import { createClassStore } from '@/data/repositories/classStore'
import type { Deck } from '@/domain/types'
import { useClassNews } from '@/hooks/useDecks'
import { publicRead } from '@/lib/classConfig'
import { checkClasses, dismissNews } from '@/lib/classRunner'
import { requestSync } from '@/lib/syncRunner'
import { Button } from '@/ui/Button'
import { plural, timeAgo } from '@/ui/format'

/** A joined class on its deck page: where it's from, new lessons to add, updates, and the way out. */
export function ClassStatus({ deck }: { deck: Deck }) {
  const remote = deck.remote!
  const news = useClassNews()[deck.id]
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()

  async function addLessons(ids: string[]) {
    setBusy(true)
    setError(undefined)
    try {
      let opened = await openClass(publicRead, remote.manifestId)
      // A locked class opens with the key the student already has.
      if (opened.manifest.lock) opened = { ...opened, key: remote.key, body: await openBody(opened.manifest, remote.key) }
      await takeLessons(publicRead, createClassStore(), opened, ids)
      await dismissNews(deck.id, ids)
      requestSync('review')
    } catch (e) {
      setError(e instanceof ClassError ? e.message : 'Couldn’t add the lesson. Check the connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  async function check() {
    setBusy(true)
    await checkClasses(true)
    setBusy(false)
  }

  return (
    <section className="mt-8 rounded-3xl border border-line bg-surface p-4 text-sm">
      <h2 className="text-lg font-semibold">Class</h2>
      <p className="mt-1 text-muted">
        {deck.teacher ? `From ${deck.teacher}. ` : ''}
        {remote.manifestId ? 'Your teacher keeps the cards up to date; changes arrive here by themselves.' : 'Opened from a class file: open a newer file of the class to update it.'}
      </p>
      {remote.stopped && <p className="mt-2 rounded-xl bg-amber-100 p-3 text-amber-900 dark:bg-amber-950 dark:text-amber-200">Your teacher stopped sharing this class. You keep the cards you have.</p>}

      {news && news.newLessons.length > 0 && (
        <div className="mt-3 rounded-2xl bg-accent/10 p-3">
          <p className="font-semibold">New {news.newLessons.length === 1 ? 'lesson' : 'lessons'} from your teacher</p>
          <ul className="mt-2 flex flex-col gap-2">
            {news.newLessons.map((l) => (
              <li key={l.id} className="flex items-center gap-2">
                <span className="min-w-0 flex-1">
                  {l.title} <span className="text-muted">· {plural(l.cards, 'card')}</span>
                </span>
                <Button size="sm" disabled={busy} onClick={() => void addLessons([l.id])}>
                  Add
                </Button>
              </li>
            ))}
          </ul>
          <button type="button" className="mt-2 text-sm font-medium text-muted hover:text-ink" onClick={() => void dismissNews(deck.id, news.newLessons.map((l) => l.id))}>
            Not now
          </button>
        </div>
      )}

      {remote.manifestId && !remote.stopped && (
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
          <Link to={`/join/${remote.manifestId}`} className="font-semibold text-accent">
            More lessons
          </Link>
          <button type="button" className="font-semibold text-accent disabled:opacity-50" disabled={busy} onClick={() => void check()}>
            {busy ? 'Checking…' : 'Check for updates'}
          </button>
          {news?.at && <span className="text-muted">looked {timeAgo(news.at)}</span>}
        </div>
      )}
      {error && <p className="mt-2 text-red-600 dark:text-red-400">{error}</p>}
    </section>
  )
}

