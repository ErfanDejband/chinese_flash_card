import { addDays, diffDays, toLocalDate, weekday } from './dates'
import { effectiveBox } from './leitner/scheduler'
import type { Card, Id, LeitnerConfig, LocalDate, ReviewLogEntry, ReviewMode, Timestamp } from './types'

/**
 * Progress statistics, derived from the append-only review log. Each log entry is the first
 * answer of a day for one card in one direction (re-asks within a session are not logged).
 */

export interface DayActivity {
  reviews: number
  knew: number
  forgot: number
}

const dayOf = (at: Timestamp): LocalDate => toLocalDate(new Date(at))

/** Reviews per local day. */
export function dailyActivity(log: ReviewLogEntry[]): Map<LocalDate, DayActivity> {
  const days = new Map<LocalDate, DayActivity>()
  for (const e of log) {
    const day = dayOf(e.at)
    const a = days.get(day) ?? { reviews: 0, knew: 0, forgot: 0 }
    a.reviews++
    if (e.result === 'knew') a.knew++
    else a.forgot++
    days.set(day, a)
  }
  return days
}

export interface Streaks {
  /** Consecutive days up to today, or up to yesterday while today has no review yet. */
  current: number
  best: number
  reviewedToday: boolean
}

/** A day counts when it has at least one review. */
export function streaks(activeDays: Iterable<LocalDate>, today: LocalDate): Streaks {
  const days = new Set(activeDays)
  const reviewedToday = days.has(today)
  let current = 0
  for (let d = reviewedToday ? today : addDays(today, -1); days.has(d); d = addDays(d, -1)) current++

  let best = 0
  let run = 0
  let prev: LocalDate | undefined
  for (const d of [...days].sort()) {
    run = prev !== undefined && diffDays(prev, d) === 1 ? run + 1 : 1
    best = Math.max(best, run)
    prev = d
  }
  return { current, best, reviewedToday }
}

export interface PeriodStats {
  reviews: number
  knew: number
  /** Share known on the first answer of the day, 0–100; null without reviews. */
  knewPct: number | null
  /** Cards answered for the first time (they left the new-card pool). */
  newCards: number
  daysStudied: number
}

function periodStats(entries: ReviewLogEntry[]): PeriodStats {
  const knew = entries.filter((e) => e.result === 'knew').length
  return {
    reviews: entries.length,
    knew,
    knewPct: entries.length ? Math.round((knew / entries.length) * 100) : null,
    newCards: entries.filter((e) => e.fromBox === 0).length,
    daysStudied: new Set(entries.map((e) => dayOf(e.at))).size,
  }
}

/** The last 7 days (today included) and the 7 days before them. */
export function periodSummary(log: ReviewLogEntry[], today: LocalDate): { current: PeriodStats; previous: PeriodStats } {
  const current: ReviewLogEntry[] = []
  const previous: ReviewLogEntry[] = []
  for (const e of log) {
    const age = diffDays(dayOf(e.at), today)
    if (age >= 0 && age < 7) current.push(e)
    else if (age >= 7 && age < 14) previous.push(e)
  }
  return { current: periodStats(current), previous: periodStats(previous) }
}

export interface BoxSnapshot {
  /** Last day of the 7-day period. */
  end: LocalDate
  /** Started cards per box: index 0 = box 1. */
  counts: number[]
}

/**
 * Started cards per box at the end of each of the last `weeks` 7-day periods (the newest ends
 * today), replaying one direction's log. Deleted cards drop out from the day they were deleted;
 * boxes above the current box count are clamped like everywhere else.
 */
export function boxHistory(
  log: ReviewLogEntry[],
  mode: ReviewMode,
  cards: Card[],
  config: LeitnerConfig,
  today: LocalDate,
  weeks = 12,
): BoxSnapshot[] {
  const cardById = new Map(cards.map((c) => [c.id, c]))
  const entries = log.filter((e) => e.mode === mode).sort((a, b) => a.at - b.at)
  const boxOf = new Map<Id, number>()
  const snapshots: BoxSnapshot[] = []
  let next = 0
  for (let w = weeks - 1; w >= 0; w--) {
    const end = addDays(today, -7 * w)
    for (; next < entries.length && dayOf(entries[next]!.at) <= end; next++) boxOf.set(entries[next]!.cardId, entries[next]!.toBox)
    const counts = config.boxes.map(() => 0)
    for (const [cardId, box] of boxOf) {
      const card = cardById.get(cardId)
      if (!card || (card.deletedAt !== undefined && dayOf(card.deletedAt) <= end)) continue
      counts[effectiveBox(box, config) - 1]!++
    }
    snapshots.push({ end, counts })
  }
  return snapshots
}

export interface ForgottenCard {
  cardId: Id
  forgot: number
  lastForgotAt: Timestamp
}

/** Cards forgotten most often in one direction, ties broken by the most recent lapse. */
export function mostForgotten(log: ReviewLogEntry[], mode: ReviewMode): ForgottenCard[] {
  const byCard = new Map<Id, ForgottenCard>()
  for (const e of log) {
    if (e.mode !== mode || e.result !== 'forgot') continue
    const f = byCard.get(e.cardId) ?? { cardId: e.cardId, forgot: 0, lastForgotAt: 0 }
    f.forgot++
    f.lastForgotAt = Math.max(f.lastForgotAt, e.at)
    byCard.set(e.cardId, f)
  }
  return [...byCard.values()].sort((a, b) => b.forgot - a.forgot || b.lastForgotAt - a.lastForgotAt)
}

/** Calendar columns of 7 days (Monday first) ending with the week of `today`; future days are null. */
export function calendarWeeks(today: LocalDate, weeks: number): (LocalDate | null)[][] {
  const start = addDays(today, -weekday(today) - 7 * (weeks - 1))
  return Array.from({ length: weeks }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => {
      const day = addDays(start, w * 7 + d)
      return day <= today ? day : null
    }),
  )
}

/** Shade 0 (no reviews) to 4 (busiest), relative to the busiest day shown. */
export function activityLevel(reviews: number, max: number): number {
  if (reviews <= 0 || max <= 0) return 0
  return Math.min(4, Math.max(1, Math.ceil((reviews / max) * 4)))
}
