import { describe, expect, it } from 'vitest'
import { addDays } from '@/domain/dates'
import { LATEST_RELEASE_ID, RELEASES } from './releases'

describe('release notes', () => {
  it('have unique ids', () => {
    expect(new Set(RELEASES.map((r) => r.id)).size).toBe(RELEASES.length)
  })

  it('are dated with real calendar days', () => {
    for (const { id } of RELEASES) {
      expect(id).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(addDays(id, 0)).toBe(id) // 2026-02-30 would come back as 2026-03-02
    }
  })

  it('are sorted newest first', () => {
    const ids = RELEASES.map((r) => r.id)
    expect(ids).toEqual([...ids].sort().reverse())
    expect(LATEST_RELEASE_ID).toBe(ids[0])
  })

  it('have items with text, and links inside the app', () => {
    for (const release of RELEASES) {
      expect(release.items.length).toBeGreaterThan(0)
      if (release.title !== undefined) expect(release.title.trim()).not.toBe('')
      for (const item of release.items) {
        expect(item.text.trim()).not.toBe('')
        if (item.to !== undefined) expect(item.to).toMatch(/^\/[^/]/)
      }
    }
  })
})
