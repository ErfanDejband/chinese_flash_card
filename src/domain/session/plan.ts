import { newCardPool, newQuota, type DeckEntry } from '../deck'
import { effectiveBox, isDue } from '../leitner/scheduler'
import { inScope, type StudyScope } from '../scope'
import type { Id, LeitnerConfig, LocalDate } from '../types'

export type SessionRequest =
  /** Everything due today plus today's share of new cards. */
  | { kind: 'daily' }
  /** Only the due cards of one box. */
  | { kind: 'box'; box: number }
  /** Only new cards, beyond or within the daily limit. */
  | { kind: 'new'; count: number }

export interface SessionPlanOptions {
  today: LocalDate
  config: LeitnerConfig
  newPerDay: number
  random?: () => number
  /** Only these cards (default: all). The daily new-card quota still counts all cards. */
  scope?: StudyScope
  /** Lesson order for new cards (see newCardPool). */
  lessonRanks?: ReadonlyMap<Id, number>
}

export interface SessionPlan {
  cardIds: Id[]
  newIds: Id[]
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const a = [...items]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[a[i], a[j]] = [a[j]!, a[i]!]
  }
  return a
}

/**
 * Order: due cards from the lowest box up (the least-known first), shuffled within a box,
 * then new cards in introduction order.
 */
export function planSession(entries: DeckEntry[], request: SessionRequest, opts: SessionPlanOptions): SessionPlan {
  const { today, config, newPerDay, random = Math.random, scope, lessonRanks } = opts
  const scoped = scope ? entries.filter((e) => inScope(e.card, scope)) : entries

  let due: DeckEntry[] = []
  if (request.kind !== 'new') {
    due = scoped.filter((e) => isDue(e.state, today))
    if (request.kind === 'box') due = due.filter((e) => effectiveBox(e.state.box, config) === request.box)
  }
  const byBox = new Map<number, DeckEntry[]>()
  for (const e of due) {
    const box = effectiveBox(e.state.box, config)
    byBox.set(box, [...(byBox.get(box) ?? []), e])
  }
  const dueIds = [...byBox.keys()]
    .sort((a, b) => a - b)
    .flatMap((box) => shuffle(byBox.get(box)!, random).map((e) => e.card.id))

  const newCount =
    request.kind === 'daily' ? newQuota(entries, today, newPerDay) : request.kind === 'new' ? request.count : 0
  const newIds = newCardPool(scoped, lessonRanks)
    .slice(0, Math.max(0, newCount))
    .map((e) => e.card.id)

  return { cardIds: [...dueIds, ...newIds], newIds }
}
