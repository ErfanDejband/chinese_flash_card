import type { LocalDate } from './types'

const pad = (n: number, width = 2) => String(n).padStart(width, '0')

/** The local calendar day of `date`. */
export function toLocalDate(date: Date): LocalDate {
  return `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function parse(date: LocalDate): [number, number, number] {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!m) throw new Error(`Invalid LocalDate: ${date}`)
  return [Number(m[1]), Number(m[2]), Number(m[3])]
}

/** Calendar arithmetic, done in UTC so DST transitions cannot shift the day. */
export function addDays(date: LocalDate, days: number): LocalDate {
  const [y, m, d] = parse(date)
  const t = new Date(Date.UTC(y, m - 1, d + days))
  return `${pad(t.getUTCFullYear(), 4)}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`
}

/** Day of the week, Monday = 0 … Sunday = 6. */
export function weekday(date: LocalDate): number {
  const [y, m, d] = parse(date)
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7
}

/** Whole days from `from` to `to` (negative if `to` is earlier). */
export function diffDays(from: LocalDate, to: LocalDate): number {
  const [y1, m1, d1] = parse(from)
  const [y2, m2, d2] = parse(to)
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000)
}
