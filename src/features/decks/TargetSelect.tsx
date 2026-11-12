import { useState } from 'react'
import { createDeck, moveCards } from '@/data/repositories/decks'
import { MY_CARDS } from '@/domain/library'
import type { Deck, Id, Lesson } from '@/domain/types'
import { useDecks, useLessons } from '@/hooks/useDecks'
import { Button } from '@/ui/Button'
import { cn } from '@/ui/cn'
import { plural } from '@/ui/format'
import { MY_CARDS_TARGET, selectClass, targetLabel, type Target } from './target'

const NEW_DECK = '+new'
const valueOf = (t: Target) => (t.lessonId ? `${t.deckId}|${t.lessonId}` : t.deckId)
function parse(value: string): Target {
  const [deckId = MY_CARDS, lessonId] = value.split('|')
  return lessonId ? { deckId, lessonId } : { deckId }
}

/**
 * My cards, each deck, and each deck's lessons (indented). With `onNewDeck`, a last option asks
 * for a new deck's name.
 */
export function TargetSelect({
  value,
  onChange,
  decks,
  lessons,
  onNewDeck,
  id,
  className,
  label = 'Add to',
}: {
  value: Target
  onChange(t: Target): void
  decks: Deck[]
  lessons: Lesson[]
  onNewDeck?: () => void
  id?: string
  className?: string
  label?: string
}) {
  return (
    <select
      id={id}
      aria-label={label}
      value={valueOf(value)}
      onChange={(e) => (e.target.value === NEW_DECK ? onNewDeck?.() : onChange(parse(e.target.value)))}
      className={cn(selectClass, className)}
    >
      <option value={MY_CARDS}>My cards (no deck)</option>
      {decks.map((d) => (
        <optgroup key={d.id} label={d.title}>
          <option value={d.id}>{d.title}</option>
          {lessons
            .filter((l) => l.deckId === d.id)
            .map((l) => (
              <option key={l.id} value={`${d.id}|${l.id}`}>
                {'\u00a0\u00a0'}
                {l.title}
              </option>
            ))}
        </optgroup>
      ))}
      {onNewDeck && <option value={NEW_DECK}>+ New deck…</option>}
    </select>
  )
}

/** "Move these N cards to…": a target and a Move button (or a new deck's name). `onDone` gets where they went. */
export function MovePanel({ ids, onDone }: { ids: Id[]; onDone(moved: number, label: string): void }) {
  const decks = useDecks()
  const lessons = useLessons()
  const [target, setTarget] = useState<Target>(MY_CARDS_TARGET)
  const [naming, setNaming] = useState(false)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  if (!decks || !lessons) return null

  async function move() {
    setBusy(true)
    const to = naming ? { deckId: (await createDeck(name)).id } : target
    const moved = await moveCards(ids, to.deckId, to.lessonId)
    setBusy(false)
    onDone(moved, naming ? name.trim() : targetLabel(to, decks!, lessons!))
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-surface p-3">
      <span className="text-sm font-medium">Move {plural(ids.length, 'card')} to</span>
      {naming ? (
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New deck name" aria-label="New deck name" autoFocus className={cn(selectClass, 'flex-1 basis-40')} />
      ) : (
        <TargetSelect value={target} onChange={setTarget} decks={decks} lessons={lessons} onNewDeck={() => setNaming(true)} label="Move to" className="flex-1 basis-40" />
      )}
      <Button size="sm" onClick={() => void move()} disabled={busy || (naming && !name.trim())}>
        Move
      </Button>
      {naming && (
        <Button size="sm" variant="ghost" onClick={() => setNaming(false)}>
          Cancel
        </Button>
      )}
    </div>
  )
}
