import type { SyncFiles } from '@/sync/types'

/**
 * Google OAuth client of the app (Google Cloud project "Mandarin Leitner"). A client ID is
 * public by design: it only names the app on Google's consent screen. The app uses no client
 * secret. Each user's data goes to the hidden app folder of *their own* Drive.
 */
export const GOOGLE_CLIENT_ID = '638110644529-4suj7o9b8ei1cn0jvr5h2gtqv47rckq0.apps.googleusercontent.com'

/** Sync settings of this device (localStorage, never synced or backed up). */
export interface DeviceSync {
  enabled: boolean
  /** When the 1-hour Google sign-in has expired, renew it automatically on open (a quick hop to Google). */
  auto: boolean
  /** Google account, shown in Settings and used as login hint. */
  email?: string
  /** The first sync of this device has happened (combine / replace was decided). */
  initialized: boolean
  files: SyncFiles
  lastSyncAt?: number
}

const STORAGE_KEY = 'mandarin-leitner.sync'
export const DEFAULT_DEVICE_SYNC: DeviceSync = { enabled: false, auto: false, initialized: false, files: {} }

let cache: DeviceSync | undefined
const listeners = new Set<() => void>()

export function getDeviceSync(): DeviceSync {
  if (!cache) {
    try {
      cache = { ...DEFAULT_DEVICE_SYNC, ...(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Partial<DeviceSync> | null) }
    } catch {
      cache = DEFAULT_DEVICE_SYNC
    }
  }
  return cache
}

export function saveDeviceSync(next: DeviceSync): void {
  cache = next
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Storage unavailable: lasts for this session only.
  }
  listeners.forEach((l) => l())
}

export function updateDeviceSync(patch: Partial<DeviceSync>): void {
  saveDeviceSync({ ...getDeviceSync(), ...patch })
}

export function subscribeDeviceSync(listener: () => void): () => void {
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
