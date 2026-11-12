import { useState, type FormEvent, type ReactNode } from 'react'
import { MY_CARDS } from '@/domain/library'
import { ALL_CARDS, sameScope, type StudyScope } from '@/domain/scope'
import type { Deck, Lesson } from '@/domain/types'
import { Button } from '@/ui/Button'
import { cn } from '@/ui/cn'

export function Chip({ active, onClick, children }: { active: boolean; onClick(): void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'h-9 max-w-56 shrink-0 truncate rounded-full border px-4 text-sm font-medium',
        active ? 'border-transparent bg-ink text-paper' : 'border-line bg-surface text-muted',
      )}
    >
      {children}
    </button>
  )
}

/**
 * All cards · My cards · each deck; for a deck with lessons, a second row picks lessons (none
 * picked = the whole deck). Shown only once a deck exists.
 */
export function ScopePicker({ scope, decks, lessons, onChange }: { scope: StudyScope; decks: Deck[]; lessons: Lesson[]; onChange(scope: StudyScope): void }) {
  if (decks.length === 0) return null
  const deckId = scope.kind === 'deck' ? scope.deckId : undefined
  const picked = scope.kind === 'deck' ? scope.lessonIds : undefined
  const deckLessons = deckId && deckId !== MY_CARDS ? lessons.filter((l) => l.deckId === deckId) : []
  const deckScope = (id: string): StudyScope => ({ kind: 'deck', deckId: id })

  function toggleLesson(id: string) {
    const next = picked?.includes(id) ? picked.filter((l) => l !== id) : [...(picked ?? []), id]
    onChange(next.length ? { kind: 'deck', deckId: deckId!, lessonIds: next } : deckScope(deckId!))
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2 overflow-x-auto" role="group" aria-label="What to review">
        <Chip active={sameScope(scope, ALL_CARDS)} onClick={() => onChange(ALL_CARDS)}>
          All cards
        </Chip>
        <Chip active={deckId === MY_CARDS} onClick={() => onChange(deckScope(MY_CARDS))}>
          My cards
        </Chip>
        {decks.map((d) => (
          <Chip key={d.id} active={deckId === d.id} onClick={() => onChange(deckScope(d.id))}>
            {d.title}
          </Chip>
        ))}
      </div>
      {deckLessons.length > 0 && (
        <div className="flex gap-2 overflow-x-auto" role="group" aria-label="Lessons">
          <Chip active={!picked} onClick={() => onChange(deckScope(deckId!))}>
            All lessons
          </Chip>
          {deckLessons.map((l) => (
            <Chip key={l.id} active={!!picked?.includes(l.id)} onClick={() => toggleLesson(l.id)}>
              {l.title}
            </Chip>
          ))}
        </div>
      )}
    </div>
  )
}

/** A one-line name form (new deck, new lesson, rename). */
export function TitleForm({ initial = '', placeholder, submit, onSubmit, onCancel }: { initial?: string; placeholder: string; submit: string; onSubmit(title: string): void; onCancel(): void }) {
  const [title, setTitle] = useState(initial)
  const save = (e: FormEvent) => {
    e.preventDefault()
    if (title.trim()) onSubmit(title)
  }
  return (
    <form onSubmit={save} className="flex flex-wrap gap-2">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        autoFocus
        className="h-12 min-w-0 flex-1 basis-48 rounded-xl border border-line bg-surface px-3 outline-none focus:border-accent"
      />
      <div className="flex gap-2">
        <Button type="submit" disabled={!title.trim()}>
          {submit}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  )
}

/** Delete a deck or lesson: with its cards, or keeping them (`keepLabel` says where they go). */
export function RemovePanel({ what, cards, keepLabel, onRemove, onCancel }: { what: string; cards: number; keepLabel: string; onRemove(keep: boolean): void; onCancel(): void }) {
  return (
    <div className="rounded-2xl border border-red-200 bg-surface p-4 dark:border-red-900">
      <p className="font-semibold">Delete {what}?</p>
      <p className="mt-1 text-sm text-muted">
        {cards === 0 ? 'It has no cards.' : `It has ${cards === 1 ? '1 card' : `${cards} cards`}. Keep them, or delete them with their progress.`}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {cards > 0 && (
          <Button variant="secondary" size="sm" onClick={() => onRemove(true)}>
            {keepLabel}
          </Button>
        )}
        <Button variant="danger" size="sm" onClick={() => onRemove(false)}>
          {cards > 0 ? 'Delete with the cards' : 'Delete'}
        </Button>
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  )
}
