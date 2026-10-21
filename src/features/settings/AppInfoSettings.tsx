import { useEffect, useState } from 'react'
import { useCanInstall } from '@/hooks/useBrowser'
import { isStandalone, promptInstall } from '@/lib/install'
import { formatBytes, storageInfo, type StorageInfo } from '@/lib/storage'
import { Button } from '@/ui/Button'

/** Install, storage and the links to the About / Privacy pages. */
export function AppInfoSettings() {
  const canInstall = useCanInstall()
  const [info, setInfo] = useState<StorageInfo>()
  useEffect(() => {
    void storageInfo().then(setInfo)
  }, [])

  return (
    <div className="flex flex-col gap-3 text-sm">
      {isStandalone() ? (
        <p>Running as an installed app.</p>
      ) : canInstall ? (
        <div>
          <Button onClick={() => void promptInstall()}>Install app</Button>
          <p className="mt-2 text-muted">Adds the app to your home screen and lets it work offline.</p>
        </div>
      ) : (
        <p className="text-muted">To install: open the browser menu and choose “Add to Home screen” / “Install app”.</p>
      )}
      {info && (
        <p className="text-muted">
          Storage: {info.persisted ? 'persistent (protected from automatic clean-up)' : 'best-effort (the browser may clear it when space runs low — keep backups)'}
          {info.usage !== undefined && ` · ${formatBytes(info.usage)} used`}
        </p>
      )}
      <p className="text-muted">
        <a className="underline" href={`${import.meta.env.BASE_URL}about.html`}>
          About
        </a>{' '}
        ·{' '}
        <a className="underline" href={`${import.meta.env.BASE_URL}privacy.html`}>
          Privacy policy
        </a>
      </p>
    </div>
  )
}
