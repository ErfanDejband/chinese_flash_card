import { useDeviceSync, useNow, useSyncStatus } from '@/hooks/useBrowser'
import { connectGoogleDrive, disconnectGoogleDrive, resolveFirstSync, setAutoSync, syncNow } from '@/lib/syncRunner'
import { Button } from '@/ui/Button'
import { plural } from '@/ui/format'
import { syncStatusText } from '@/ui/syncText'

function PrivacyNote() {
  return (
    <p className="rounded-xl bg-sunken p-3 text-xs text-muted">
      Your data is stored in your own Google Drive, in a hidden folder only this app can open: nobody else can read it, not even the app’s
      maker. Not synced: AI keys and the speech voice (they stay on each device). To delete the Drive copy: Google Drive → Settings → Manage
      apps → Mandarin Leitner → Delete hidden app data.
    </p>
  )
}

function FirstSyncChoice({ localCards, remoteCards }: { localCards: number; remoteCards: number }) {
  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/40">
      <p className="font-semibold">Google Drive already has data</p>
      <p className="mt-1 text-sm text-muted">
        This device has {plural(localCards, 'card')}; Google Drive has {plural(remoteCards, 'card')}. How should this device start?
      </p>
      <div className="mt-3 flex flex-col gap-1.5">
        <Button onClick={() => void resolveFirstSync('combine')}>Combine both</Button>
        <p className="mb-2 text-xs text-muted">Keeps everything from both. A word added separately on both devices appears twice.</p>
        <Button variant="secondary" onClick={() => void resolveFirstSync('replace')}>
          Use the Drive copy
        </Button>
        <p className="text-xs text-muted">
          Replaces this device’s cards and progress with the Drive copy: best when the other device is the up-to-date one. Pictures stay on
          this device.
        </p>
      </div>
    </div>
  )
}

/** Settings → Sync: connect this device to the user's Google Drive app folder. */
export function SyncSettings() {
  const status = useSyncStatus()
  const config = useDeviceSync()
  const now = useNow(30_000)

  if (status.kind === 'unavailable') return <p className="text-sm text-muted">Sync isn’t set up in this version of the app.</p>

  if (!config.enabled) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted">
          Keep your phone and laptop in step: cards, progress, review history and settings sync through a hidden folder in your own Google
          Drive. Pictures follow in a later update; until then, move them with a backup.
        </p>
        <Button size="lg" className="w-full" onClick={connectGoogleDrive}>
          Connect Google Drive
        </Button>
        {status.kind === 'error' && <p className="text-sm text-red-600">{status.message}</p>}
        <PrivacyNote />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {status.kind === 'choose' ? (
        <FirstSyncChoice localCards={status.localCards} remoteCards={status.remoteCards} />
      ) : (
        <div className="rounded-xl border border-line bg-surface p-3">
          <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">✓ Connected{config.email ? ` as ${config.email}` : ''}</p>
          <p className={status.kind === 'error' ? 'mt-1 text-sm text-red-600' : 'mt-1 text-sm text-muted'} aria-live="polite">
            {syncStatusText(status, config.lastSyncAt, now)}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={syncNow} disabled={status.kind === 'syncing'}>
              {status.kind === 'syncing' ? 'Syncing…' : 'Sync now'}
            </Button>
            <Button variant="secondary" size="sm" onClick={disconnectGoogleDrive}>
              Disconnect
            </Button>
          </div>
        </div>
      )}

      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" className="mt-0.5 size-4 shrink-0" checked={config.auto} onChange={(e) => setAutoSync(e.target.checked)} />
        <span>
          <span className="font-medium">Sync automatically when the app opens</span>
          <span className="block text-muted">
            Google sign-ins last about an hour. With this on, the app renews it by itself with a quick trip to Google and back (never during a
            review or an import). Off: tap Sync when it asks.
          </span>
        </span>
      </label>

      <PrivacyNote />
    </div>
  )
}
