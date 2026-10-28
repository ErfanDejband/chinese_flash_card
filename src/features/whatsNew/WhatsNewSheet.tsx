import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { unseenReleases } from '@/domain/whatsNew'
import { useLastSeenRelease, useOnboarding, useOnboardingReady, useWhatsNewReady } from '@/hooks/useBrowser'
import { markReleasesSeen } from '@/lib/whatsNew'
import { buttonClass } from '@/ui/buttonStyles'
import { mediumDate } from '@/ui/format'
import { Icon } from '@/ui/icons'
import { ReleaseItems } from './ReleaseItems'
import { RELEASES, type Release } from './releases'

/**
 * The "What's new" note after an update, once per device. It waits for the first-run tour, and it
 * lives in AppLayout, so it never interrupts a review (/review is outside the layout).
 */
export function WhatsNewSheet() {
  const onboardingReady = useOnboardingReady()
  const { tourDone } = useOnboarding()
  const ready = useWhatsNewReady()
  const lastSeen = useLastSeenRelease()
  if (!onboardingReady || !tourDone || !ready) return null
  // Nothing seen yet (a device in use before these notes existed): only the newest note.
  const releases = unseenReleases(RELEASES, lastSeen, lastSeen ? 3 : 1)
  return releases.length > 0 ? <Sheet releases={releases} /> : null
}

/** Bottom sheet on a phone, centred card on a laptop. Closing in any way counts as seen. */
function Sheet({ releases }: { releases: Release[] }) {
  const gotIt = useRef<HTMLButtonElement>(null)
  const newest = releases[0]!
  const close = () => markReleasesSeen(newest.id)

  useEffect(() => {
    gotIt.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') markReleasesSeen(newest.id)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [newest.id])

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center md:items-center md:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="whats-new-title"
    >
      <div className="absolute inset-0 bg-black/50" onClick={close} aria-hidden="true" />
      <div className="pb-safe relative flex max-h-[85dvh] w-full max-w-md animate-reveal flex-col rounded-t-3xl border border-line bg-surface shadow-xl md:rounded-3xl">
        <header className="flex items-center gap-3 px-5 pt-5 pb-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent/10 text-accent">
            <Icon name="sparkle" className="size-5" />
          </span>
          <div className="min-w-0">
            <h2 id="whats-new-title" className="text-lg font-bold">
              What’s new
            </h2>
            <p className="text-sm text-muted">{mediumDate(newest.id)}</p>
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-2">
          {releases.map((release, i) => (
            <section key={release.id} className={i > 0 ? 'mt-4 border-t border-line pt-4' : undefined}>
              {(release.title || i > 0) && (
                <h3 className="mb-2 text-sm font-semibold">
                  {release.title}
                  {i > 0 && (
                    <span className="font-normal text-muted">
                      {release.title && ' · '}
                      {mediumDate(release.id)}
                    </span>
                  )}
                </h3>
              )}
              <ReleaseItems items={release.items} onShow={close} />
            </section>
          ))}
        </div>
        <div className="px-5 pt-3 pb-5">
          <button ref={gotIt} type="button" onClick={close} className={buttonClass('primary', 'md', 'w-full')}>
            Got it
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
