import { useMemo, useState } from 'react'
import { demoStep, demoTimeline } from '@/domain/leitner/demo'
import type { LeitnerConfig, ReviewResult } from '@/domain/types'
import { BoxesView } from '@/features/boxes/BoxesView'
import { Button } from '@/ui/Button'
import { plural } from '@/ui/format'
import { Icon } from '@/ui/icons'

const FACE = '🐱'
const DAYS = 30

/** One demo card on the real box shelf: answer it, or slide through a month, to see how the boxes work. */
export function LeitnerDemo({ config }: { config: LeitnerConfig }) {
  const timeline = useMemo(() => demoTimeline(config, DAYS), [config])
  const [box, setBox] = useState(0)
  const [day, setDay] = useState(0)
  const [caption, setCaption] = useState('A new card waits in 新. Did you know it?')

  function answer(result: ReviewResult) {
    const step = demoStep(box, result, config)
    setBox(step.box)
    setCaption(
      result === 'knew'
        ? `Knew it → Box ${step.box}. It comes back in ${plural(step.inDays, 'day')}.`
        : `Forgot → ${step.box === 1 ? 'back to' : 'down to'} Box ${step.box}. You see it again before the session ends, then in ${plural(step.inDays, 'day')}.`,
    )
  }

  function slide(d: number) {
    const t = timeline[d]!
    setDay(d)
    setBox(t.box)
    setCaption(
      t.reviewed ? `Day ${d}: reviewed, known → Box ${t.box}. Next review on day ${t.nextDay}.` : `Day ${d}: resting in Box ${t.box}. Next review on day ${t.nextDay}.`,
    )
  }

  const reviewDays = timeline.filter((t) => t.reviewed).map((t) => t.day)
  const boxes = config.boxes.map((_, i) => ({ box: i + 1, total: box === i + 1 ? 1 : 0, due: 0 }))

  return (
    <div className="rounded-3xl border border-line bg-surface p-4 shadow-sm">
      <BoxesView notStarted={box === 0 ? 1 : 0} boxes={boxes} linked={false} highlight={{ box, face: FACE }} compact />
      <p className="mt-3 min-h-10 text-sm" aria-live="polite">
        {caption}
      </p>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <Button variant="forgot" onClick={() => answer('forgot')}>
          <Icon name="x" /> Forgot
        </Button>
        <Button variant="knew" onClick={() => answer('knew')}>
          <Icon name="check" /> Knew
        </Button>
      </div>
      <label className="mt-4 block text-sm">
        <span className="flex justify-between font-medium">
          <span>Play a month</span>
          <span className="text-muted tabular-nums">Day {day}</span>
        </span>
        <input type="range" min={0} max={DAYS} value={day} onChange={(e) => slide(Number(e.target.value))} className="mt-1 w-full accent-accent" />
      </label>
      <p className="text-xs text-muted">
        Known every time, a card comes back only {reviewDays.length} times in {DAYS} days (days {reviewDays.join(', ')}).
      </p>
    </div>
  )
}
