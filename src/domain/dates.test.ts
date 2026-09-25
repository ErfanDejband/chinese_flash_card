import { describe, expect, it } from 'vitest'
import { addDays, diffDays, toLocalDate } from './dates'

describe('dates', () => {
  it('formats the local calendar day', () => {
    expect(toLocalDate(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05')
    expect(toLocalDate(new Date(2026, 11, 31, 0, 0))).toBe('2026-12-31')
  })

  it.each([
    ['2026-09-25', 1, '2026-09-26'],
    ['2026-09-30', 1, '2026-10-01'],
    ['2026-12-31', 1, '2027-01-01'],
    ['2028-02-28', 1, '2028-02-29'], // leap year
    ['2027-02-28', 1, '2027-03-01'],
    ['2026-03-28', 2, '2026-03-30'], // across the EU DST switch
    ['2026-01-10', -10, '2025-12-31'],
    ['2026-01-10', 0, '2026-01-10'],
  ])('addDays(%s, %i) = %s', (date, days, expected) => {
    expect(addDays(date, days)).toBe(expected)
  })

  it('diffDays is the inverse of addDays', () => {
    expect(diffDays('2026-09-25', '2026-10-09')).toBe(14)
    expect(diffDays('2026-10-09', '2026-09-25')).toBe(-14)
    expect(diffDays('2026-12-31', addDays('2026-12-31', 100))).toBe(100)
  })

  it('rejects malformed dates', () => {
    expect(() => addDays('2026-9-5', 1)).toThrow()
  })
})
