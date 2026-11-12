import { MY_CARDS } from '@/domain/library'
import type { Deck, Id, Lesson } from '@/domain/types'

/** Where cards go: a deck (My cards = `default`) and optionally one of its lessons. */
export interface Target {
  deckId: Id
  lessonId?: Id
}

export const MY_CARDS_TARGET: Target = { deckId: MY_CARDS }

/** A target that still exists (a deleted deck or lesson falls back to the deck or My cards). */
export function liveTarget(t: Target, decks: readonly Deck[], lessons: readonly Lesson[]): Target {
  if (t.deckId !== MY_CARDS && !decks.some((d) => d.id === t.deckId)) return MY_CARDS_TARGET
  if (t.lessonId && !lessons.some((l) => l.id === t.lessonId && l.deckId === t.deckId)) return { deckId: t.deckId }
  return t
}

/** `?deck=<id>&lesson=<id>` → a target (My cards when missing). */
export function targetFromParams(params: URLSearchParams): Target {
  const deckId = params.get('deck') || MY_CARDS
  const lessonId = params.get('lesson')
  return lessonId && deckId !== MY_CARDS ? { deckId, lessonId } : { deckId }
}

/** The target's query parameters, to pass it on to another screen. */
export function targetQuery(t: Target): string {
  if (t.deckId === MY_CARDS) return ''
  return new URLSearchParams(t.lessonId ? { deck: t.deckId, lesson: t.lessonId } : { deck: t.deckId }).toString()
}

/** "Book 2 › Lesson 3", or "My cards". */
export function targetLabel(t: Target, decks: readonly Deck[], lessons: readonly Lesson[]): string {
  const deck = decks.find((d) => d.id === t.deckId)
  if (!deck) return 'My cards'
  const lesson = t.lessonId ? lessons.find((l) => l.id === t.lessonId) : undefined
  return lesson ? `${deck.title} › ${lesson.title}` : deck.title
}

export const selectClass = 'h-11 min-w-0 rounded-xl border border-line bg-surface px-3 outline-none focus:border-accent'
