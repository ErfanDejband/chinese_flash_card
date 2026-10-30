import { listActiveCards } from '@/data/repositories/cards'
import { createSyncStore } from '@/data/repositories/syncStore'
import { createDrive } from '@/sync/drive'
import type { PictureProgress } from '@/sync/pictures'
import { inspectRemote, replaceLocalFromRemote, replaceRemoteFromLocal, runSync, type SyncOptions } from '@/sync/runSync'
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
  /** `picturesLeft`: card pictures that couldn't move yet (a later sync carries on). */
  | { kind: 'idle'; picturesLeft?: number }
  /** `pictures`: how far the picture transfer is (missing while the cards sync). */
  | { kind: 'syncing'; pictures?: PictureProgress }
  | { kind: 'needs-sign-in' }
  | { kind: 'choose'; localCards: number; remoteCards: number }
  | { kind: 'error'; message: string }

/** The first-sync choice when Drive and this device both have cards. */
export type FirstSyncChoice = 'combine' | 'drive' | 'device'

type Reason = 'start' | 'foreground' | 'background' | 'review' | 'timer' | 'online'

const PERIOD_MS = 5 * 60_000

let status: SyncStatus = { kind: GOOGLE_CLIENT_ID ? 'off' : 'unavailable' }
const listeners = new Set<() => void>()
let running: Promise<void> | undefined
/** A sync was asked for while one ran (after a review, say): run once more afterwards. */
let again = false
/** The running sync's; disconnecting aborts it, so a long picture transfer stops. */
let current: AbortController | undefined
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

async function run(mode?: FirstSyncChoice): Promise<void> {
  if (running) {
    again = true
    return running
  }
  const controller = new AbortController()
  current = controller
  running = (async () => {
    setStatus({ kind: 'syncing' })
    let retry = false
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
          choice = remote.hasData ? 'drive' : 'combine'
        }
        const options: SyncOptions = {
          signal: controller.signal,
          onProgress: (p) => {
            if (!controller.signal.aborted) setStatus(p.step === 'pictures' && p.total > 0 ? { kind: 'syncing', pictures: { done: p.done, total: p.total } } : { kind: 'syncing' })
          },
        }
        const outcome =
          choice === 'drive'
            ? await replaceLocalFromRemote(drive, store, options)
            : choice === 'device'
              ? await replaceRemoteFromLocal(drive, store, options)
              : await runSync(drive, store, config.initialized ? config.files : {}, options)
        // Disconnected meanwhile: this device's sync settings were reset; leave them so.
        if (controller.signal.aborted) return
        updateDeviceSync({ initialized: true, files: outcome.files, lastSyncAt: Date.now() })
        const { uploaded, downloaded, removed, left } = outcome.pictures
        setStatus({ kind: 'idle', picturesLeft: left || undefined })
        // A transfer cut short (a dropped connection) carries on soon, as long as pictures keep moving.
        retry = left > 0 && uploaded + downloaded + removed > 0
      })
    } catch (e) {
      if (controller.signal.aborted) return
      if (e instanceof SyncError && e.kind === 'auth') {
        clearGoogleToken()
        setStatus({ kind: 'needs-sign-in' })
      } else {
        setStatus({ kind: 'error', message: errorMessage(e) })
      }
    } finally {
      running = undefined
      if (current === controller) current = undefined
    }
    if (retry || again) {
      setTimeout(() => requestSync('timer'), again ? 0 : 5000)
      again = false
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
  startGoogleSignIn({ returnTo: '/settings/sync', chooseAccount: true })
}

/** Stop syncing on this device. The data stays on the device and in Drive. */
export function disconnectGoogleDrive(): void {
  current?.abort()
  again = false
  clearGoogleToken()
  saveDeviceSync({ ...DEFAULT_DEVICE_SYNC, auto: getDeviceSync().auto })
  setStatus({ kind: 'off' })
}

export function setAutoSync(auto: boolean): void {
  updateDeviceSync({ auto })
}

/** The first-sync choice: combine both copies, or make this device or Drive match the other. */
export function resolveFirstSync(choice: FirstSyncChoice): Promise<void> {
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
