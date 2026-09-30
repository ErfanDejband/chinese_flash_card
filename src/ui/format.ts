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

/** 950 → "950", 14230 → "14.2k", 2_500_000 → "2.5M". */
export function formatTokens(n: number): string {
  if (n < 1000) return String(n)
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`
  return `${(n / 1_000_000).toFixed(1)}M`
}

/** Dollar amounts from fractions of a cent upward. */
export function formatUsd(usd: number): string {
  if (usd === 0) return '$0'
  if (usd < 0.01) return '<$0.01'
  return `$${usd.toFixed(usd < 10 ? 2 : 0)}`
}

export function plural(n: number, word: string, pluralWord = `${word}s`): string {
  return `${n} ${n === 1 ? word : pluralWord}`
}
