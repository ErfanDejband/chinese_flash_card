import { useReadingPref } from '@/hooks/useBrowser'
import { READING_PREFS, saveReadingPref, type ReadingPref } from '@/lib/readingPref'
import { cn } from '@/ui/cn'
import { Hanzi } from '@/ui/Hanzi'
import { Reading } from '@/ui/Reading'

const LABELS: Record<ReadingPref, string> = { pinyin: 'Pinyin', zhuyin: 'Zhuyin', both: 'Both' }

/** How a word's reading is written everywhere in the app. Kept on this device only. */
export function ReadingSettings() {
  const pref = useReadingPref()
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Pinyin and zhuyin">
        {READING_PREFS.map((option) => {
          const active = pref === option
          return (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => saveReadingPref(option)}
              className={cn(
                'flex flex-col items-center gap-1 rounded-xl border p-3 font-semibold',
                active ? 'border-accent bg-accent/10' : 'border-line bg-paper',
              )}
            >
              <Hanzi className="text-lg">老師</Hanzi>
              <Reading pinyin="lǎoshī" hanzi="老師" show={option} className="text-center text-xs font-normal text-muted" />
              {LABELS[option]}
            </button>
          )
        })}
      </div>
      <p className="text-sm text-muted">You always type pinyin when editing a card; the zhuyin is worked out from it. Saved on this device.</p>
    </div>
  )
}
