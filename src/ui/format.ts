import { diffDays } from '@/domain/dates'
import type { LocalDate } from '@/domain/types'

/** "today", "tomorrow", "in 5 days", "3 days ago". */
export function relativeDay(date: LocalDate, today: LocalDate): string {
  const d = diffDays(today, date)
  if (d === 0) return 'today'
  if (d === 1) return 'tomorrow'
  if (d === -1) return 'yesterday'
  return d > 0 ? `in ${d} days` : `${-d} days ago`
}

/** "Friday, September 25". */
export function longDate(date: LocalDate): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(y!, m! - 1, d!).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
}

export function shortDateTime(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

export function plural(n: number, word: string, pluralWord = `${word}s`): string {
  return `${n} ${n === 1 ? word : pluralWord}`
}
