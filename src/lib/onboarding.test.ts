import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  _resetOnboardingCache,
  DEFAULT_ONBOARDING,
  getOnboarding,
  initOnboarding,
  isOnboardingReady,
  markTipSeen,
  resetOnboarding,
  subscribeOnboarding,
  updateOnboarding,
} from './onboarding'

// Minimal localStorage for Node.
const store = new Map<string, string>()
globalThis.localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
  key: () => null,
  length: 0,
} as Storage

const KEY = 'mandarin-leitner.onboarding'

beforeEach(() => {
  store.clear()
  _resetOnboardingCache()
})

describe('onboarding state', () => {
  it('starts empty on a fresh device', () => {
    expect(getOnboarding()).toEqual(DEFAULT_ONBOARDING)
  })

  it('saves changes and tells subscribers', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeOnboarding(listener)
    updateOnboarding({ seenTips: ['first-card'], directionChosen: true })
    unsubscribe()
    expect(listener).toHaveBeenCalledTimes(1)
    _resetOnboardingCache()
    expect(getOnboarding()).toMatchObject({ seenTips: ['first-card'], directionChosen: true, tourDone: false })
  })

  it('reset brings the tips, tour and checklist back but keeps what the learner did', () => {
    updateOnboarding({ seenTips: ['a', 'b'], tourDone: true, checklistDismissed: true, directionChosen: true, backedUp: true })
    resetOnboarding()
    expect(getOnboarding()).toEqual({ ...DEFAULT_ONBOARDING, directionChosen: true, backedUp: true })
  })

  it.each(['not json', '42', 'null', '{"seenTips":"x","tourDone":"yes"}'])('reads %s as the defaults', (raw) => {
    store.set(KEY, raw)
    expect(getOnboarding()).toEqual(DEFAULT_ONBOARDING)
  })

  it('marks a tip seen once', () => {
    markTipSeen('a')
    markTipSeen('a')
    markTipSeen('b')
    expect(getOnboarding().seenTips).toEqual(['a', 'b'])
  })

  it('drops tip ids that are not strings', () => {
    store.set(KEY, JSON.stringify({ seenTips: ['ok', 3, null], tourDone: true }))
    expect(getOnboarding()).toMatchObject({ seenTips: ['ok'], tourDone: true })
  })
})

describe('start-up check', () => {
  it('skips everything on a device that already has review history', async () => {
    await initOnboarding(['a', 'b'], async () => true)
    expect(isOnboardingReady()).toBe(true)
    _resetOnboardingCache()
    expect(getOnboarding()).toEqual({ ...DEFAULT_ONBOARDING, seenTips: ['a', 'b'], tourDone: true, checklistDismissed: true, directionChosen: true })
  })

  it('writes nothing on a fresh device', async () => {
    await initOnboarding(['a'], async () => false)
    expect(isOnboardingReady()).toBe(true)
    expect(store.has(KEY)).toBe(false)
  })

  it('leaves an existing state alone', async () => {
    updateOnboarding({ seenTips: ['a'] })
    const hasHistory = vi.fn(async () => true)
    await initOnboarding(['a', 'b'], hasHistory)
    expect(hasHistory).not.toHaveBeenCalled()
    expect(getOnboarding().seenTips).toEqual(['a'])
  })

  it('counts a failed history check as a fresh device', async () => {
    await initOnboarding(['a'], async () => Promise.reject(new Error('db')))
    expect(isOnboardingReady()).toBe(true)
    expect(store.has(KEY)).toBe(false)
  })
})
