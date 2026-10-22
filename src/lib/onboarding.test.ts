import { beforeEach, describe, expect, it, vi } from 'vitest'
import { _resetOnboardingCache, DEFAULT_ONBOARDING, getOnboarding, resetOnboarding, subscribeOnboarding, updateOnboarding } from './onboarding'

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

  it('drops tip ids that are not strings', () => {
    store.set(KEY, JSON.stringify({ seenTips: ['ok', 3, null], tourDone: true }))
    expect(getOnboarding()).toMatchObject({ seenTips: ['ok'], tourDone: true })
  })
})
