import { useRegisterSW } from 'virtual:pwa-register/react'
import { Button } from '@/ui/Button'

/** Shown when a new version of the app has been downloaded; reloading is the user's choice. */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW()

  if (!needRefresh) return null
  return (
    <div className="fixed inset-x-4 top-4 z-50 mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-line bg-surface p-3 pl-4 shadow-xl">
      <span className="flex-1 text-sm">A new version is available.</span>
      <Button size="sm" variant="ghost" onClick={() => setNeedRefresh(false)}>
        Later
      </Button>
      <Button size="sm" onClick={() => void updateServiceWorker(true)}>
        Reload
      </Button>
    </div>
  )
}
