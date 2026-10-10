import { listActiveCards } from '@/data/repositories/cards'
import { createSyncStore } from '@/data/repositories/syncStore'
import { createDrive } from '@/sync/drive'
import { inspectRemote, replaceLocalFromRemote, runSync } from '@/sync/runSync'
import { SyncError } from '@/sync/types'
import { isBusy } from './busy'
import { clearGoogleToken, fetchGoogleEmail, getGoogleToken, startGoogleSignIn, type GoogleCallbackResult } from './googleSignIn'
import { DEFAULT_DEVICE_SYNC, getDeviceSync, GOOGLE_CLIENT_ID, saveDeviceSync, updateDeviceSync } from './syncConfig'

/**
 * When and how this device syncs with Google Drive. With a valid token it syncs silently
 * (start, back to the foreground, after a review, every 5 minutes). Once the 1-hour token has
 * expired it waits for a tap, or, with "automatic" on, renews it with a quick hop to Google:
 * only at start or on return to the app, never during a review or a running import.
 */
export type SyncStatus =
  | { kind: 'unavailable' }
  | { kind: 'off' }
  | { kind: 'idle' }
  | { kind: 'syncing' }
  | { kind: 'needs-sign-in' }
  | { kind: 'choose'; localCards: number; remoteCards: number }
  | { kind: 'error'; message: string }

type Reason = 'start' | 'foreground' | 'background' | 'review' | 'timer' | 'online'

const PERIOD_MS = 5 * 60_000

let status: SyncStatus = { kind: GOOGLE_CLIENT_ID ? 'off' : 'unavailable' }
const listeners = new Set<() => void>()
let running: Promise<void> | undefined
/** A silent renewal already failed on this page load: don't hop again until the user taps. */
let silentFailed = false
let started = false

function setStatus(next: SyncStatus) {
  status = next
  listeners.forEach((l) => l())
}

export function getSyncStatus(): SyncStatus {
  return status
}

export function subscribeSyncStatus(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

const currentRoute = () => (location.hash.startsWith('#/') ? location.hash.slice(1) : '/')
const inReview = () => currentRoute().startsWith('/review')

async function withLock(fn: () => Promise<void>): Promise<void> {
  if (navigator.locks) await navigator.locks.request('mandarin-leitner-sync', fn)
  else await fn()
}

function errorMessage(e: unknown): string {
  if (e instanceof SyncError && e.kind === 'network') return 'Couldn’t reach Google Drive (offline?). Will retry.'
  return e instanceof Error ? e.message : 'Sync failed.'
}

async function run(mode?: 'combine' | 'replace'): Promise<void> {
  if (running) return running
  running = (async () => {
    setStatus({ kind: 'syncing' })
    try {
      await withLock(async () => {
        const drive = createDrive(() => getGoogleToken())
        const store = createSyncStore()
        let config = getDeviceSync()
        if (!config.email) {
          const token = getGoogleToken()
          const email = token ? await fetchGoogleEmail(token) : undefined
          if (email) updateDeviceSync({ email })
        }
        config = getDeviceSync()
        let choice = mode
        if (!config.initialized && !choice) {
          const remote = await inspectRemote(drive)
          const localCards = (await listActiveCards()).length
          if (remote.hasData && localCards > 0) {
            setStatus({ kind: 'choose', localCards, remoteCards: remote.cards })
            return
          }
          choice = remote.hasData ? 'replace' : 'combine'
        }
        const outcome = choice === 'replace' ? await replaceLocalFromRemote(drive, store) : await runSync(drive, store, config.initialized ? config.files : {})
        updateDeviceSync({ initialized: true, files: outcome.files, lastSyncAt: Date.now() })
        setStatus({ kind: 'idle' })
      })
    } catch (e) {
      if (e instanceof SyncError && e.kind === 'auth') {
        clearGoogleToken()
        setStatus({ kind: 'needs-sign-in' })
      } else {
        setStatus({ kind: 'error', message: errorMessage(e) })
      }
    } finally {
      running = undefined
    }
  })()
  return running
}

/** Background trigger: syncs if possible without the user; may hop to Google when "automatic" is on. */
export function requestSync(reason: Reason): void {
  const config = getDeviceSync()
  if (!GOOGLE_CLIENT_ID || !config.enabled || status.kind === 'choose') return
  if (getGoogleToken()) {
    void run()
    return
  }
  const canHop = config.auto && (reason === 'start' || reason === 'foreground') && !silentFailed && !inReview() && !isBusy() && navigator.onLine
  if (canHop) startGoogleSignIn({ returnTo: currentRoute(), silent: true, loginHint: config.email })
  else setStatus({ kind: 'needs-sign-in' })
}

/** "Sync now" / "Tap to sync" (a user action, so a hop to Google is fine). */
export function syncNow(): void {
  if (getGoogleToken()) void run()
  else startGoogleSignIn({ returnTo: currentRoute(), loginHint: getDeviceSync().email })
}

export function connectGoogleDrive(): void {
  startGoogleSignIn({ returnTo: '/settings', chooseAccount: true })
}

/** Stop syncing on this device. The data stays on the device and in Drive. */
export function disconnectGoogleDrive(): void {
  clearGoogleToken()
  saveDeviceSync({ ...DEFAULT_DEVICE_SYNC, auto: getDeviceSync().auto })
  setStatus({ kind: 'off' })
}

export function setAutoSync(auto: boolean): void {
  updateDeviceSync({ auto })
}

/** The first-sync choice: combine both copies, or replace this device with the Drive copy. */
export function resolveFirstSync(choice: 'combine' | 'replace'): Promise<void> {
  return run(choice)
}

/** Call once at startup, after `handleGoogleCallback`. */
export function initSync(callback?: GoogleCallbackResult): void {
  if (!GOOGLE_CLIENT_ID || started) return
  started = true

  if (callback?.kind === 'token') {
    // Back from Google with a token: this device is (now) connected.
    if (!getDeviceSync().enabled) updateDeviceSync({ enabled: true, email: undefined })
  } else if (callback?.kind === 'error') {
    if (callback.silent) silentFailed = true
    else setStatus({ kind: 'error', message: callback.error === 'access_denied' ? 'Google sign-in was cancelled.' : `Google sign-in failed (${callback.error}).` })
  } else if (callback?.kind === 'mismatch') {
    setStatus({ kind: 'error', message: 'That Google sign-in could not be verified. Please try again.' })
  }

  if (status.kind !== 'error') setStatus(getDeviceSync().enabled ? { kind: 'idle' } : { kind: 'off' })

  document.addEventListener('visibilitychange', () => requestSync(document.visibilityState === 'visible' ? 'foreground' : 'background'))
  window.addEventListener('online', () => requestSync('online'))
  setInterval(() => document.visibilityState === 'visible' && requestSync('timer'), PERIOD_MS)
  requestSync('start')
}
