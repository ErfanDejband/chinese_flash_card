/**
 * The newest release note this device has seen (features/whatsNew/releases.ts). Kept in
 * localStorage only (never synced or backed up): each device shows a note once after it updates.
 */
interface WhatsNewState {
  /** Id (`YYYY-MM-DD`) of the newest release seen; `''` = none yet. */
  lastSeen: string
}

const STORAGE_KEY = 'mandarin-leitner.whats-new'

let cache: string | undefined
let ready = false
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((l) => l())

/** The stored id, or undefined when nothing valid is stored. */
function parse(raw: string | null): string | undefined {
  try {
    const value = JSON.parse(raw ?? 'null') as Partial<WhatsNewState> | null
    return value && typeof value === 'object' && typeof value.lastSeen === 'string' ? value.lastSeen : undefined
  } catch {
    return undefined
  }
}

/** Id of the newest release seen on this device; `''` when none. */
export function getLastSeenRelease(): string {
  if (cache === undefined) {
    try {
      cache = parse(localStorage.getItem(STORAGE_KEY)) ?? ''
    } catch {
      cache = ''
    }
  }
  return cache
}

function save(lastSeen: string): void {
  cache = lastSeen
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ lastSeen } satisfies WhatsNewState))
  } catch {
    // Storage unavailable: lasts for this session only.
  }
  notify()
}

/** The note up to release `id` was read or closed. Never moves back to an older release. */
export function markReleasesSeen(id: string): void {
  if (id > getLastSeenRelease()) save(id)
}

export function subscribeWhatsNew(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** False until `initWhatsNew` has run: the note waits for it. */
export function isWhatsNewReady(): boolean {
  return ready
}

/**
 * Called once at start-up. The first time this state is missing, a device already in use (cards or
 * review history from before this feature, from sync or a restore) gets the newest note once; a
 * fresh device counts it as seen, since new learners get the first-run help instead.
 */
export async function initWhatsNew(latestId: string, isExistingUser: () => Promise<boolean>): Promise<void> {
  try {
    let raw: string | null
    try {
      raw = localStorage.getItem(STORAGE_KEY)
    } catch {
      // Storage unavailable: nothing would remember the note, so don't show it on every start.
      cache = latestId
      return
    }
    if (parse(raw) !== undefined) return
    save((await isExistingUser().catch(() => false)) ? '' : latestId)
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
export function _resetWhatsNewCache(): void {
  cache = undefined
  ready = false
}
