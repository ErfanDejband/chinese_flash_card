/**
 * First-run help on this device: which tips were closed, whether the tour ran, the getting-started
 * checklist. Kept in localStorage only (never synced or backed up), like the theme.
 */
export interface OnboardingState {
  /** Ids of the tips already closed. */
  seenTips: string[]
  tourDone: boolean
  checklistDismissed: boolean
  /** A practice direction was picked on purpose (on the welcome screen or in Settings). */
  directionChosen: boolean
  /** A backup file was saved on this device. */
  backedUp: boolean
}

const STORAGE_KEY = 'mandarin-leitner.onboarding'
export const DEFAULT_ONBOARDING: OnboardingState = {
  seenTips: [],
  tourDone: false,
  checklistDismissed: false,
  directionChosen: false,
  backedUp: false,
}

let cache: OnboardingState | undefined
const listeners = new Set<() => void>()

function parse(raw: string | null): OnboardingState {
  const value = JSON.parse(raw ?? 'null') as Partial<Record<keyof OnboardingState, unknown>> | null
  if (!value || typeof value !== 'object') return DEFAULT_ONBOARDING
  return {
    seenTips: Array.isArray(value.seenTips) ? value.seenTips.filter((t): t is string => typeof t === 'string') : [],
    tourDone: value.tourDone === true,
    checklistDismissed: value.checklistDismissed === true,
    directionChosen: value.directionChosen === true,
    backedUp: value.backedUp === true,
  }
}

export function getOnboarding(): OnboardingState {
  if (!cache) {
    try {
      cache = parse(localStorage.getItem(STORAGE_KEY))
    } catch {
      cache = DEFAULT_ONBOARDING
    }
  }
  return cache
}

function save(next: OnboardingState): void {
  cache = next
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Storage unavailable: lasts for this session only.
  }
  listeners.forEach((l) => l())
}

export function updateOnboarding(patch: Partial<OnboardingState>): void {
  save({ ...getOnboarding(), ...patch })
}

/** Show the tips, the tour and the checklist again. What the learner did (direction, backup) stays. */
export function resetOnboarding(): void {
  updateOnboarding({ seenTips: [], tourDone: false, checklistDismissed: false })
}

export function subscribeOnboarding(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== STORAGE_KEY && e.key !== null) return
    cache = undefined
    listeners.forEach((l) => l())
  })
}

/** Forget the cached state (tests). */
export function _resetOnboardingCache(): void {
  cache = undefined
}
