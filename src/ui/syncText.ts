import type { SyncStatus } from '@/lib/syncRunner'
import { timeAgo } from './format'

/** One line describing the sync state, shared by Settings and the Progress tab. */
export function syncStatusText(status: SyncStatus, lastSyncAt: number | undefined, now: number): string {
  switch (status.kind) {
    case 'syncing':
      return 'Syncing…'
    case 'needs-sign-in':
      return 'The Google sign-in has expired: tap Sync to renew it.'
    case 'choose':
      return 'Choose how this device starts syncing (Settings).'
    case 'error':
      return status.message
    default:
      return lastSyncAt ? `Synced ${timeAgo(lastSyncAt, now)}` : 'Not synced yet'
  }
}
