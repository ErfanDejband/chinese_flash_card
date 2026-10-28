import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  _resetWhatsNewCache,
  getLastSeenRelease,
  initWhatsNew,
  isWhatsNewReady,
  markReleasesSeen,
  subscribeWhatsNew,
} from './whatsNew'

// Minimal localStorage for Node.
const store = new Map<string, string>()
const storage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
  key: () => null,
  length: 0,
} as Storage
globalThis.localStorage = storage

const KEY = 'mandarin-leitner.whats-new'
const stored = () => JSON.parse(store.get(KEY) ?? 'null') as unknown

beforeEach(() => {
  store.clear()
  _resetWhatsNewCache()
  vi.restoreAllMocks()
})

describe('what’s-new state', () => {
  it('reads as nothing seen when empty', () => {
    expect(getLastSeenRelease()).toBe('')
  })

  it('saves the newest release seen and tells subscribers', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeWhatsNew(listener)
    markReleasesSeen('2026-10-28')
    unsubscribe()
    expect(listener).toHaveBeenCalledTimes(1)
    expect(stored()).toEqual({ lastSeen: '2026-10-28' })
    _resetWhatsNewCache()
    expect(getLastSeenRelease()).toBe('2026-10-28')
  })

  it('never moves back to an older release', () => {
    markReleasesSeen('2026-10-28')
    markReleasesSeen('2026-10-23')
    expect(getLastSeenRelease()).toBe('2026-10-28')
  })

  it.each(['not json', '42', 'null', '{"lastSeen":3}', '{}'])('reads %s as nothing seen', (raw) => {
    store.set(KEY, raw)
    expect(getLastSeenRelease()).toBe('')
  })
})

describe('start-up check', () => {
  it('shows the newest note once on a device already in use', async () => {
    const isExistingUser = vi.fn(async () => true)
    await initWhatsNew('2026-10-28', isExistingUser)
    expect(isWhatsNewReady()).toBe(true)
    expect(isExistingUser).toHaveBeenCalledTimes(1)
    expect(stored()).toEqual({ lastSeen: '' })
    expect(getLastSeenRelease()).toBe('')
  })

  it('counts the newest note as seen on a fresh device', async () => {
    await initWhatsNew('2026-10-28', async () => false)
    expect(stored()).toEqual({ lastSeen: '2026-10-28' })
    expect(getLastSeenRelease()).toBe('2026-10-28')
  })

  it('treats a failed check as a fresh device', async () => {
    await initWhatsNew('2026-10-28', () => Promise.reject(new Error('db')))
    expect(isWhatsNewReady()).toBe(true)
    expect(getLastSeenRelease()).toBe('2026-10-28')
  })

  it('leaves a stored state alone', async () => {
    store.set(KEY, JSON.stringify({ lastSeen: '2026-10-20' }))
    const isExistingUser = vi.fn(async () => false)
    await initWhatsNew('2026-10-28', isExistingUser)
    expect(isExistingUser).not.toHaveBeenCalled()
    expect(getLastSeenRelease()).toBe('2026-10-20')
  })

  it('runs the check again when the stored state is unreadable', async () => {
    store.set(KEY, 'not json')
    await initWhatsNew('2026-10-28', async () => true)
    expect(stored()).toEqual({ lastSeen: '' })
  })

  it('shows nothing when storage is unavailable', async () => {
    vi.spyOn(storage, 'getItem').mockImplementation(() => {
      throw new Error('denied')
    })
    const isExistingUser = vi.fn(async () => true)
    await initWhatsNew('2026-10-28', isExistingUser)
    expect(isExistingUser).not.toHaveBeenCalled()
    expect(isWhatsNewReady()).toBe(true)
    expect(getLastSeenRelease()).toBe('2026-10-28')
  })

  it('tells subscribers when it is ready', async () => {
    const listener = vi.fn()
    const unsubscribe = subscribeWhatsNew(listener)
    expect(isWhatsNewReady()).toBe(false)
    await initWhatsNew('2026-10-28', async () => false)
    unsubscribe()
    expect(listener).toHaveBeenCalled()
  })
})
