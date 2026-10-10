import { useAiSettings, useFreeQuota, useSignInStatus } from '@/hooks/useBrowser'
import { disconnectOpenRouter, startOpenRouterSignIn } from '@/lib/openrouterSignIn'
import { Button } from '@/ui/Button'

/** "Free" AI setup: Sign in with OpenRouter, then its free models; no key to copy. */
export function FreeAiSettings() {
  const settings = useAiSettings()
  const status = useSignInStatus()
  const key = settings.free.apiKey.trim()
  const quota = useFreeQuota(key)
  const connecting = status.kind === 'connecting'

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted">
        Import reads your pages with free AI models through OpenRouter. Sign in there with Google or e-mail: no card and no key to copy. The free
        tier covers about {quota?.limit ?? 50} pages a day.
      </p>

      {key ? (
        <div className="rounded-xl border border-line bg-surface p-3">
          <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">✓ Connected to OpenRouter</p>
          <p className="mt-1 text-sm text-muted">
            {quota ? `${quota.remaining} of ${quota.limit} free pages left today. ` : ''}A free model that reads images is picked for each page.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
            <Button variant="secondary" size="sm" onClick={disconnectOpenRouter}>
              Disconnect
            </Button>
            <a className="text-sm text-muted underline" href="https://openrouter.ai/settings/keys" target="_blank" rel="noreferrer">
              Manage or revoke the key on openrouter.ai
            </a>
          </div>
        </div>
      ) : (
        <Button size="lg" className="w-full" disabled={connecting} onClick={() => void startOpenRouterSignIn('/settings')}>
          {connecting ? 'Connecting…' : 'Connect OpenRouter'}
        </Button>
      )}

      <p className="text-sm" aria-live="polite">
        {status.kind === 'error' ? (
          <span className="text-red-600">{status.message}</span>
        ) : connecting ? (
          <span className="text-muted">Finishing the sign-in…</span>
        ) : null}
      </p>

      <p className="rounded-xl bg-sunken p-3 text-xs text-muted">
        Privacy: page images are sent to OpenRouter and the free model it picks. The key stays on this device (not in backups). Free models’
        providers may log or use submitted content — fine for course material, but don’t import private documents.
      </p>
    </div>
  )
}
