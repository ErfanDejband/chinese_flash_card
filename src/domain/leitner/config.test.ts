import { describe, expect, it } from 'vitest'
import { DEFAULT_LEITNER, validateLeitnerConfig } from './config'

const boxes = (...days: number[]) => days.map((intervalDays) => ({ intervalDays }))

describe('validateLeitnerConfig', () => {
  it('accepts the default', () => {
    expect(validateLeitnerConfig(DEFAULT_LEITNER)).toEqual([])
  })

  it.each([
    [boxes(1, 2), 'between'],
    [boxes(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11), 'between'],
    [boxes(1, 0, 4), 'whole number'],
    [boxes(1, 2.5, 4), 'whole number'],
    [boxes(1, 4, 2), 'shorter'],
  ])('rejects %o', (b, message) => {
    const errors = validateLeitnerConfig({ boxes: b, onFail: 'reset' })
    expect(errors.join(' ')).toContain(message)
  })
})
