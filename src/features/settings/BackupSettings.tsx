import { useRef, useState } from 'react'
import { BackupFormatError, exportBackup, restoreBackup } from '@/data/backup/backup'
import { toLocalDate } from '@/domain/dates'
import { downloadFile } from '@/lib/storage'
import { Button } from '@/ui/Button'
import { plural } from '@/ui/format'
import { Icon } from '@/ui/icons'

type Status = { kind: 'idle' } | { kind: 'working' } | { kind: 'done'; message: string } | { kind: 'error'; message: string }

export function BackupSettings() {
  const input = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<File>()
  const [status, setStatus] = useState<Status>({ kind: 'idle' })

  async function doExport() {
    setStatus({ kind: 'working' })
    try {
      const bytes = await exportBackup()
      downloadFile(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/zip' }), `mandarin-leitner-${toLocalDate(new Date())}.zip`)
      setStatus({ kind: 'done', message: 'Backup downloaded.' })
    } catch (e) {
      setStatus({ kind: 'error', message: e instanceof Error ? e.message : 'Export failed' })
    }
  }

  async function doRestore(mode: 'merge' | 'replace') {
    if (!pending) return
    if (mode === 'replace' && !confirm('Replace ALL cards and progress on this device with the backup?')) return
    setStatus({ kind: 'working' })
    try {
      const result = await restoreBackup(new Uint8Array(await pending.arrayBuffer()), mode)
      setPending(undefined)
      setStatus({
        kind: 'done',
        message:
          mode === 'replace'
            ? `Restored ${plural(result.cards, 'card')}.`
            : `Merged: ${plural(result.cards, 'card')} added or updated, ${plural(result.media, 'image')} and ${plural(result.reviews, 'review')} added.`,
      })
    } catch (e) {
      setStatus({ kind: 'error', message: e instanceof BackupFormatError ? e.message : 'Restore failed.' })
    }
  }

  const working = status.kind === 'working'

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted">
        Your cards live only in this browser. Export a backup regularly, and use it to move your deck between your computer and your phone.
      </p>
      <div className="flex flex-wrap gap-3">
        <Button variant="secondary" onClick={() => void doExport()} disabled={working}>
          <Icon name="download" className="size-5" /> Export backup
        </Button>
        <Button variant="secondary" onClick={() => input.current?.click()} disabled={working}>
          <Icon name="upload" className="size-5" /> Restore from file
        </Button>
        <input
          ref={input}
          type="file"
          accept=".zip,application/zip"
          hidden
          onChange={(e) => {
            setPending(e.target.files?.[0])
            setStatus({ kind: 'idle' })
            e.target.value = ''
          }}
        />
      </div>

      {pending && (
        <div className="rounded-2xl border border-line bg-paper p-4">
          <p className="mb-3 text-sm">
            How should <span className="font-semibold break-all">{pending.name}</span> be restored?
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button onClick={() => void doRestore('merge')} disabled={working}>
              Merge (keep newest)
            </Button>
            <Button variant="danger" onClick={() => void doRestore('replace')} disabled={working}>
              Replace everything
            </Button>
            <Button variant="ghost" onClick={() => setPending(undefined)} disabled={working}>
              Cancel
            </Button>
          </div>
          <p className="mt-3 text-xs text-muted">
            Merge keeps whichever version of each card and its progress was changed most recently, so reviews done on this device are not lost.
          </p>
        </div>
      )}

      {status.kind === 'working' && <p className="text-sm text-muted">Working…</p>}
      {status.kind === 'done' && <p className="text-sm text-emerald-700 dark:text-emerald-400">{status.message}</p>}
      {status.kind === 'error' && <p className="text-sm text-red-600">{status.message}</p>}
    </div>
  )
}
