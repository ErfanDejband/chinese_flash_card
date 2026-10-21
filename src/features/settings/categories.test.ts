import { describe, expect, it } from 'vitest'
import { findCategory, SECTION_TITLES, SETTINGS_CATEGORIES, type SettingsSectionId } from './categories'

describe('settings categories', () => {
  it('have unique ids and at least one section each', () => {
    expect(new Set(SETTINGS_CATEGORIES.map((c) => c.id)).size).toBe(SETTINGS_CATEGORIES.length)
    for (const c of SETTINGS_CATEGORIES) expect(c.sections.length).toBeGreaterThan(0)
  })

  it('place every section exactly once', () => {
    const placed = SETTINGS_CATEGORIES.flatMap((c) => c.sections)
    expect([...placed].sort()).toEqual((Object.keys(SECTION_TITLES) as SettingsSectionId[]).sort())
  })

  it('are found by URL segment', () => {
    expect(findCategory('ai')?.sections).toEqual(['ai', 'pictures', 'usage'])
    expect(findCategory('nope')).toBeUndefined()
    expect(findCategory(undefined)).toBeUndefined()
  })
})
