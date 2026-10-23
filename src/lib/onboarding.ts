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
let ready = false
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((l) => l())

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
  notify()
}

export function updateOnboarding(patch: Partial<OnboardingState>): void {
  save({ ...getOnboarding(), ...patch })
}

export function markTipSeen(id: string): void {
  const { seenTips } = getOnboarding()
  if (!seenTips.includes(id)) updateOnboarding({ seenTips: [...seenTips, id] })
}

/** Show the tips, the tour and the checklist again. What the learner did (direction, backup) stays. */
export function resetOnboarding(): void {
  updateOnboarding({ seenTips: [], tourDone: false, checklistDismissed: false })
}

export function subscribeOnboarding(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** False until `initOnboarding` has run: tips, the tour and the checklist wait for it. */
export function isOnboardingReady(): boolean {
  return ready
}

/**
 * Called once at start-up. A device that already has review history when this state is first
 * created (used before first-run help existed, or filled by sync or a restore) skips the tips, the
 * tour and the checklist. A fresh device writes nothing until something is seen or chosen.
 */
export async function initOnboarding(tipIds: readonly string[], hasHistory: () => Promise<boolean>): Promise<void> {
  try {
    let stored: string | null = null
    try {
      stored = localStorage.getItem(STORAGE_KEY)
    } catch {
      // Storage unavailable: nothing to migrate.
    }
    if (stored === null && (await hasHistory().catch(() => false))) {
      save({ ...getOnboarding(), seenTips: [...tipIds], tourDone: true, checklistDismissed: true, directionChosen: true })
    }
  } finally {
    ready = true
    notify()
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== STORAGE_KEY && e.key !== null) return
    cache = undefined
    notify()
  })
}

/** Forget the cached state and the start-up check (tests). */
export function _resetOnboardingCache(): void {
  cache = undefined
  ready = false
}
