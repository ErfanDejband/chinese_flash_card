import { useState } from 'react'
import { saveSettings, validateSettings, type SettingsInput } from '@/data/repositories/settings'
import { DEFAULT_LEITNER, DEFAULT_NEW_PER_DAY, MAX_BOXES, MIN_BOXES } from '@/domain/leitner/config'
import type { AppSettings, LeitnerConfig } from '@/domain/types'
import { boxTone } from '@/ui/boxTones'
import { Button } from '@/ui/Button'
import { cn } from '@/ui/cn'

const numberInput = 'h-11 w-20 rounded-xl border border-line bg-paper px-3 text-center tabular-nums outline-none focus:border-accent'

export function LeitnerSettings({ settings }: { settings: AppSettings }) {
  const [intervals, setIntervals] = useState(settings.leitner.boxes.map((b) => String(b.intervalDays)))
  const [onFail, setOnFail] = useState<LeitnerConfig['onFail']>(settings.leitner.onFail)
  const [newPerDay, setNewPerDay] = useState(String(settings.newPerDay))
  const [saved, setSaved] = useState(false)

  const input: SettingsInput = {
    leitner: { boxes: intervals.map((v) => ({ intervalDays: Number(v) })), onFail },
    newPerDay: Number(newPerDay),
    ttsVoiceURI: settings.ttsVoiceURI,
    reviewMode: settings.reviewMode,
  }
  const errors = validateSettings(input)
  const dirty =
    JSON.stringify([input.leitner, input.newPerDay]) !== JSON.stringify([settings.leitner, settings.newPerDay])

  const edit = <T,>(setter: (v: T) => void) => (v: T) => {
    setter(v)
    setSaved(false)
  }
  const updateIntervals = edit((next: string[]) => setIntervals(next))

  function resetDefaults() {
    setIntervals(DEFAULT_LEITNER.boxes.map((b) => String(b.intervalDays)))
    setOnFail(DEFAULT_LEITNER.onFail)
    setNewPerDay(String(DEFAULT_NEW_PER_DAY))
    setSaved(false)
  }

  async function save() {
    await saveSettings(input)
    setSaved(true)
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h3 className="mb-1 font-semibold">Review intervals</h3>
        <p className="mb-3 text-sm text-muted">A card you know moves up one box and comes back after that box's interval.</p>
        <ul className="flex flex-col gap-2">
          {intervals.map((value, i) => (
            <li key={i} className="flex items-center gap-3">
              <span className={cn('w-16 rounded-lg px-2 py-1 text-center text-sm font-semibold', boxTone(i + 1, intervals.length).badge)}>
                Box {i + 1}
              </span>
              <span className="text-sm text-muted">every</span>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={365}
                value={value}
                onChange={(e) => updateIntervals(intervals.map((v, j) => (j === i ? e.target.value : v)))}
                className={numberInput}
                aria-label={`Box ${i + 1} interval in days`}
              />
              <span className="text-sm text-muted">{value === '1' ? 'day' : 'days'}</span>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex gap-2">
          <Button
            size="sm"
            variant="secondary"
            disabled={intervals.length >= MAX_BOXES}
            onClick={() => updateIntervals([...intervals, String(Number(intervals.at(-1) ?? 1) * 2)])}
          >
            Add box
          </Button>
          <Button size="sm" variant="ghost" disabled={intervals.length <= MIN_BOXES} onClick={() => updateIntervals(intervals.slice(0, -1))}>
            Remove last box
          </Button>
        </div>
        <p className="mt-2 text-xs text-muted">Cards in a removed box count as being in the new last box.</p>
      </div>

      <fieldset>
        <legend className="mb-2 font-semibold">When you forget a card</legend>
        {(
          [
            ['reset', 'Back to Box 1', 'Classic Leitner'],
            ['demote', 'Down one box', 'Gentler for cards you almost knew'],
          ] as const
        ).map(([value, label, hint]) => (
          <label key={value} className="flex cursor-pointer items-center gap-3 rounded-xl px-1 py-2">
            <input
              type="radio"
              name="onFail"
              checked={onFail === value}
              onChange={() => edit(setOnFail)(value)}
              className="size-5 accent-(--color-accent)"
            />
            <span>
              <span className="font-medium">{label}</span> <span className="text-sm text-muted">· {hint}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <div>
        <label htmlFor="newPerDay" className="mb-1 block font-semibold">
          New cards per day
        </label>
        <p className="mb-2 text-sm text-muted">New and imported cards wait in the pool and enter Box 1 at this pace.</p>
        <input
          id="newPerDay"
          type="number"
          inputMode="numeric"
          min={0}
          max={500}
          value={newPerDay}
          onChange={(e) => edit(setNewPerDay)(e.target.value)}
          className={numberInput}
        />
      </div>

      {errors.length > 0 && (
        <ul className="rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-300">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => void save()} disabled={!dirty || errors.length > 0}>
          Save
        </Button>
        <Button variant="ghost" onClick={resetDefaults}>
          Reset to defaults
        </Button>
        {saved && !dirty && <span className="text-sm text-emerald-600 dark:text-emerald-400">Saved</span>}
      </div>
    </div>
  )
}
