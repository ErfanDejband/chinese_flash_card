import { ReleaseItems } from '@/features/whatsNew/ReleaseItems'
import { RELEASES, releaseDay } from '@/features/whatsNew/releases'
import { versionLabel } from '@/lib/appBuild'
import { mediumDate } from '@/ui/format'
import { Icon } from '@/ui/icons'

/** The version on this device and every release note: the newest open, older ones folded. */
export function WhatsNewSettings() {
  return (
    <div className="flex flex-col gap-3 text-sm">
      <p className="text-muted">
        Version <span className="tabular-nums">{versionLabel()}</span>
      </p>
      <div className="divide-y divide-line border-t border-line">
        {RELEASES.map((release, i) => (
          <details key={release.id} open={i === 0} className="group">
            <summary className="flex cursor-pointer list-none items-center gap-3 py-3 [&::-webkit-details-marker]:hidden">
              <span className="min-w-0 flex-1">
                <span className="font-semibold">{release.title ?? mediumDate(releaseDay(release.id))}</span>
                {release.title && <span className="text-muted"> · {mediumDate(releaseDay(release.id))}</span>}
              </span>
              <Icon name="chevron" className="size-5 shrink-0 text-muted transition group-open:rotate-90 motion-reduce:transition-none" />
            </summary>
            <div className="pb-4">
              <ReleaseItems items={release.items} />
            </div>
          </details>
        ))}
      </div>
    </div>
  )
}
