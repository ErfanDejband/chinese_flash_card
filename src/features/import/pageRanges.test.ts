import { describe, expect, it } from 'vitest'
import { formatPageRanges, parsePageRanges } from './pageRanges'

describe('page ranges', () => {
  it.each([
    ['1-3, 5', 10, [1, 2, 3, 5]],
    ['5-3', 10, [3, 4, 5]],
    ['8-20', 10, [8, 9, 10]],
    ['0, 2, x, 3-', 10, [2]],
    ['2 2 4', 10, [2, 4]],
    ['', 10, []],
  ])('parse %s (max %i)', (text, max, expected) => {
    expect(parsePageRanges(text, max)).toEqual(expected)
  })

  it('formats', () => {
    expect(formatPageRanges([5, 1, 2, 3, 9, 10])).toBe('1-3, 5, 9-10')
    expect(formatPageRanges([])).toBe('')
  })
})
