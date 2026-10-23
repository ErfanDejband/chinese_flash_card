import { useLiveQuery } from 'dexie-react-hooks'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { countReviews } from '@/data/repositories/review'
import { CHECKLIST_CARDS, checklistItems, type ChecklistId } from '@/domain/onboarding'
import { useCanInstall, useDeviceSync, useOnboarding } from '@/hooks/useBrowser'
import { isStandalone, promptInstall } from '@/lib/install'
import { updateOnboarding } from '@/lib/onboarding'
import { cn } from '@/ui/cn'
import { Icon } from '@/ui/icons'
import { HelpWordLine } from './Tip'
import { CHECKLIST_WORD } from './tips'

const ROW = 'flex min-h-10 items-center gap-3 rounded-lg px-2 py-1.5 text-left text-sm'

function Mark({ done }: { done: boolean }) {
  return (
    <span
      className={cn(
        'grid size-6 shrink-0 place-items-center rounded-full border-2',
        done ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-line text-transparent',
      )}
      aria-hidden="true"
    >
      <Icon name="check" className="size-3.5" />
    </span>
  )
}

/** The getting-started list on Home until everything is done or it is closed. Ticks itself. */
export function Checklist({ ownCards }: { ownCards: number }) {
  const onboarding = useOnboarding()
  const sync = useDeviceSync()
  const canInstall = useCanInstall()
  const reviews = useLiveQuery(() => countReviews(), [])
  if (onboarding.checklistDismissed || reviews === undefined) return null

  const items = checklistItems({
    ownCards,
    reviews,
    directionChosen: onboarding.directionChosen,
    installed: isStandalone(),
    safe: sync.enabled || onboarding.backedUp,
  })
  const doneCount = items.filter((i) => i.done).length
  if (doneCount === items.length) return null

  const labels: Record<ChecklistId, ReactNode> = {
    cards: (
      <>
        Add {CHECKLIST_CARDS} words of your own
        {ownCards > 0 && ownCards < CHECKLIST_CARDS && <span className="text-muted"> ({ownCards}/{CHECKLIST_CARDS})</span>}
      </>
    ),
    review: 'Do your first review',
    direction: 'Pick how you practice',
    install: 'Install the app',
    safe: 'Keep your cards safe: sync or a backup',
  }
  const links: Record<ChecklistId, string> = {
    cards: '/cards/new',
    review: '/review',
    direction: '/settings/study',
    install: '/help?topic=install',
    safe: '/settings/sync',
  }

  return (
    <section className="mb-4 rounded-2xl border border-line bg-surface p-4" aria-label="Getting started">
      <div className="mb-1 flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold">
            Getting started{' '}
            <span className="text-sm font-normal text-muted tabular-nums">
              {doneCount}/{items.length}
            </span>
          </h2>
          <div className="text-xs">
            <HelpWordLine word={CHECKLIST_WORD} />
          </div>
        </div>
        <button
          type="button"
          onClick={() => updateOnboarding({ checklistDismissed: true })}
          className="-mt-1 -mr-1 grid size-8 shrink-0 place-items-center rounded-full text-muted hover:bg-sunken"
          aria-label="Close the getting-started list"
        >
          <Icon name="x" className="size-4" />
        </button>
      </div>
      <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-sunken" role="progressbar" aria-valuenow={doneCount} aria-valuemax={items.length} aria-label="Done">
        <div className="h-full rounded-full bg-emerald-600 transition-all" style={{ width: `${(doneCount / items.length) * 100}%` }} />
      </div>
      <ul className="-mx-2">
        {items.map(({ id, done }) => (
          <li key={id}>
            {done ? (
              <span className={cn(ROW, 'text-muted line-through')}>
                <Mark done />
                {labels[id]}
              </span>
            ) : id === 'install' && canInstall ? (
              <button type="button" className={cn(ROW, 'w-full hover:bg-sunken')} onClick={() => void promptInstall()}>
                <Mark done={false} />
                <span className="flex-1">{labels[id]}</span>
                <Icon name="chevron" className="size-4 text-muted" />
              </button>
            ) : (
              <Link to={links[id]} className={cn(ROW, 'hover:bg-sunken')}>
                <Mark done={false} />
                <span className="flex-1">{labels[id]}</span>
                <Icon name="chevron" className="size-4 text-muted" />
              </Link>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
