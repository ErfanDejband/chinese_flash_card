import { useEffect, useState, type ReactNode } from 'react'
import { appRootUrl } from '@/lib/appUrl'
import { activeSupportLinks, REPO_URL } from '@/lib/support'
import { Button } from '@/ui/Button'
import { buttonClass } from '@/ui/buttonStyles'
import { Icon, type IconName } from '@/ui/icons'

type ShareStatus = 'idle' | 'copied' | 'manual'

function ExternalButton({ href, icon, children }: { href: string; icon: IconName; children: ReactNode }) {
  return (
    <a className={buttonClass('secondary', 'sm')} href={href} target="_blank" rel="noreferrer">
      <Icon name={icon} className="size-4" /> {children}
    </a>
  )
}

/** Donation links (only those filled in, see lib/support.ts), plus ways to help that cost nothing. */
export function SupportSettings() {
  const donations = activeSupportLinks()
  const url = appRootUrl()
  const [share, setShare] = useState<ShareStatus>('idle')

  // "Link copied" fades after a moment.
  useEffect(() => {
    if (share !== 'copied') return
    const timer = setTimeout(() => setShare('idle'), 2500)
    return () => clearTimeout(timer)
  }, [share])

  async function shareApp() {
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: 'Mandarin Leitner', url })
        return
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return // the share sheet was closed
      }
    }
    try {
      await navigator.clipboard.writeText(url)
      setShare('copied')
    } catch {
      setShare('manual')
    }
  }

  return (
    <div className="flex flex-col gap-3 text-sm">
      <p className="text-muted">
        Mandarin Leitner is free, with no ads and no tracking. If it helps you,{' '}
        {donations.length > 0 ? 'you can support it:' : 'here’s how you can help:'}
      </p>
      {donations.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {donations.map((link) => (
            <a
              key={link.id}
              href={link.url}
              target="_blank"
              rel="noreferrer"
              className="flex max-w-full items-center gap-3 rounded-xl border border-line bg-paper p-3 text-left hover:bg-sunken"
            >
              <Icon name="heart" className="size-5 shrink-0 text-accent" />
              <span className="min-w-0">
                <span className="block font-semibold">{link.label}</span>
                <span className="block text-xs text-muted">{link.note}</span>
              </span>
            </a>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <ExternalButton href={REPO_URL} icon="star">
          Star on GitHub
        </ExternalButton>
        <ExternalButton href={`${REPO_URL}/issues/new`} icon="external">
          Report a bug or idea
        </ExternalButton>
        <Button variant="secondary" size="sm" onClick={() => void shareApp()}>
          <Icon name="share" className="size-4" /> Share the app
        </Button>
      </div>
      {share === 'copied' && (
        <p className="text-muted" role="status">
          Link copied.
        </p>
      )}
      {share === 'manual' && (
        <p className="text-muted">
          Share this link: <span className="font-medium break-all text-ink select-all">{url}</span>
        </p>
      )}
    </div>
  )
}
