import { saveSettings } from '@/data/repositories/settings'
import { REVIEW_MODES } from '@/domain/leitner/config'
import type { AppSettings } from '@/domain/types'
import { useVoices } from '@/hooks/useBrowser'
import { speechSupported } from '@/lib/speech'
import { cn } from '@/ui/cn'
import { reviewModeInfo } from '@/ui/reviewModes'

/** Why Sound → Chinese may not speak on this device; nothing when it can. */
function ListeningNote() {
  const voices = useVoices()
  if (!speechSupported()) return <p className="text-sm text-muted">This browser has no text-to-speech; the pinyin is shown instead.</p>
  if (voices.length > 0) return null
  return (
    <p className="text-sm text-muted">No Mandarin voice found on this device. On Android: Settings → System → Languages → Text-to-speech.</p>
  )
}

/** Which side of the card is the question. Each direction keeps its own boxes. */
export function DirectionSettings({ settings }: { settings: AppSettings }) {
  async function choose(reviewMode: AppSettings['reviewMode']) {
    const { updatedAt: _updatedAt, ...rest } = settings
    await saveSettings({ ...rest, reviewMode })
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Practice direction">
        {REVIEW_MODES.map((mode) => {
          const info = reviewModeInfo(mode)
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
      {settings.reviewMode === 'listening' && <ListeningNote />}
      <p className="text-sm text-muted">
        Each direction keeps its own boxes and progress. The first time you switch, your cards start as new cards in that direction.
      </p>
    </div>
  )
}
