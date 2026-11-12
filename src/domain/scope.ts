import { isActive, MY_CARDS } from './library'
import type { Card, Deck, Id, Lesson } from './types'

/**
 * What to review: every card, or one deck (My cards = {@link MY_CARDS}), optionally only some of
 * its lessons. The daily new-card limit is shared by all scopes (see planSession).
 */
export type StudyScope = { kind: 'all' } | { kind: 'deck'; deckId: Id; lessonIds?: Id[] }

export const ALL_CARDS: StudyScope = { kind: 'all' }

export function inScope(card: Pick<Card, 'deckId' | 'lessonId'>, scope: StudyScope): boolean {
  if (scope.kind === 'all') return true
  if (card.deckId !== scope.deckId) return false
  return !scope.lessonIds || (card.lessonId !== undefined && scope.lessonIds.includes(card.lessonId))
}

/** `?deck=<id>&lessons=a,b` → scope; no `deck` → all cards. */
export function parseScope(params: URLSearchParams): StudyScope {
  const deckId = params.get('deck')
  if (!deckId) return ALL_CARDS
  const lessonIds = params.get('lessons')?.split(',').filter(Boolean)
  return lessonIds?.length ? { kind: 'deck', deckId, lessonIds } : { kind: 'deck', deckId }
}

/** The scope's query parameters (none for all cards), to add to a `/review` link. */
export function scopeParams(scope: StudyScope): [string, string][] {
  if (scope.kind === 'all') return []
  return scope.lessonIds?.length ? [['deck', scope.deckId], ['lessons', scope.lessonIds.join(',')]] : [['deck', scope.deckId]]
}

/** `/review` (or `path`) with the scope and any extra parameters. */
export function scopedLink(path: string, scope: StudyScope, extra: [string, string][] = []): string {
  const query = new URLSearchParams([...extra, ...scopeParams(scope)]).toString()
  return query ? `${path}?${query}` : path
}

/**
 * A saved scope checked against what exists now: a deleted deck means all cards, deleted lessons
 * are dropped, and no lessons left means the whole deck.
 */
export function resolveScope(scope: StudyScope, decks: readonly Deck[], lessons: readonly Lesson[]): StudyScope {
  if (scope.kind === 'all') return scope
  if (scope.deckId !== MY_CARDS && !decks.some((d) => d.id === scope.deckId && isActive(d))) return ALL_CARDS
  if (!scope.lessonIds) return scope
  const live = new Set(lessons.filter((l) => l.deckId === scope.deckId && isActive(l)).map((l) => l.id))
  const lessonIds = scope.lessonIds.filter((id) => live.has(id))
  return lessonIds.length ? { kind: 'deck', deckId: scope.deckId, lessonIds } : { kind: 'deck', deckId: scope.deckId }
}

export const sameScope = (a: StudyScope, b: StudyScope) => JSON.stringify(scopeParams(a)) === JSON.stringify(scopeParams(b))
