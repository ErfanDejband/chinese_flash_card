import { Link } from 'react-router'
import { useDeviceSync, useNow, useSyncStatus } from '@/hooks/useBrowser'
import { syncNow } from '@/lib/syncRunner'
import { syncStatusText } from '@/ui/syncText'

/** Sync at a glance under the study card; hidden while this device doesn't sync. */
export function SyncStatusLine() {
  const status = useSyncStatus()
  const config = useDeviceSync()
  const now = useNow(30_000)
  if (status.kind === 'unavailable' || status.kind === 'off' || !config.enabled) return null

  const action =
    status.kind === 'needs-sign-in' ? (
      <button type="button" onClick={syncNow} className="font-semibold text-accent">
        Tap to sync
      </button>
    ) : status.kind === 'error' ? (
      <button type="button" onClick={syncNow} className="font-semibold text-accent">
        Retry
      </button>
    ) : status.kind === 'choose' ? (
      <Link to="/settings" className="font-semibold text-accent">
        Settings →
      </Link>
    ) : status.kind === 'idle' ? (
      <button type="button" onClick={syncNow} className="text-accent" aria-label="Sync now">
        ↻
      </button>
    ) : null

  return (
    <div className="mt-2 flex items-center justify-end gap-2 px-1 text-xs text-muted" aria-live="polite">
      <span className={status.kind === 'error' ? 'text-red-600' : undefined}>
        {status.kind === 'idle' && config.lastSyncAt ? '✓ ' : ''}
        {status.kind === 'needs-sign-in' ? 'Google sign-in expired' : syncStatusText(status, config.lastSyncAt, now)}
      </span>
      {action}
    </div>
  )
}
