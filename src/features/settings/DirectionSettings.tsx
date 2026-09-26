import { saveSettings } from '@/data/repositories/settings'
import { REVIEW_MODES } from '@/domain/leitner/config'
import type { AppSettings } from '@/domain/types'
import { cn } from '@/ui/cn'
import { REVIEW_MODE_INFO } from '@/ui/reviewModes'

/** Which side of the card is the question. Each direction keeps its own boxes. */
export function DirectionSettings({ settings }: { settings: AppSettings }) {
  async function choose(reviewMode: AppSettings['reviewMode']) {
    const { updatedAt: _updatedAt, ...rest } = settings
    await saveSettings({ ...rest, reviewMode })
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Practice direction">
        {REVIEW_MODES.map((mode) => {
          const info = REVIEW_MODE_INFO[mode]
          const active = settings.reviewMode === mode
          return (
            <button
              key={mode}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => void choose(mode)}
              className={cn('rounded-xl border p-3 text-left', active ? 'border-accent bg-accent/10' : 'border-line bg-paper')}
            >
              <div className="font-semibold">{info.label}</div>
              <div className="mt-1 text-xs text-muted">Front: {info.front}</div>
              <div className="text-xs text-muted">Back: {info.back}</div>
            </button>
          )
        })}
      </div>
      <p className="text-sm text-muted">
        Each direction keeps its own boxes and progress. The first time you switch, your cards start as new cards in that direction.
      </p>
    </div>
  )
}
