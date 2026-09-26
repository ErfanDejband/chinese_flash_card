import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_LEITNER } from '@/domain/leitner/config'
import { ALL_TABLES, db } from '../db'
import { getSettings, saveSettings, validateSettings } from './settings'

beforeEach(async () => {
  await Promise.all(ALL_TABLES().map((t) => t.clear()))
})

describe('settings repository', () => {
  it('defaults the practice direction for rows saved before it existed', async () => {
    // A settings row as written by the first version of the app (no reviewMode).
    await db.settings.put({ id: 'app', leitner: DEFAULT_LEITNER, newPerDay: 10, updatedAt: 1 } as never)
    expect(await getSettings()).toMatchObject({ newPerDay: 10, reviewMode: 'image_to_word' })
  })

  it('saves and reads the practice direction', async () => {
    await saveSettings({ leitner: DEFAULT_LEITNER, newPerDay: 15, reviewMode: 'hanzi_to_meaning' })
    expect((await getSettings()).reviewMode).toBe('hanzi_to_meaning')
  })

  it('rejects an unknown direction', () => {
    const errors = validateSettings({ leitner: DEFAULT_LEITNER, newPerDay: 15, reviewMode: 'sideways' as never })
    expect(errors).toContain('Unknown practice direction.')
  })
})
