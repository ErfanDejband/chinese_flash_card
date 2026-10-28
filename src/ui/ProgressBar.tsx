import { cn } from './cn'
import { Shimmer } from './Skeleton'

export type SegmentState = 'done' | 'current' | 'failed' | 'pending'

const SEGMENT_CLASS: Record<SegmentState, string> = {
  done: 'bg-accent',
  current: 'bg-accent/40',
  failed: 'bg-red-500 dark:bg-red-400',
  pending: 'bg-sunken',
}

/** Up to this many steps get a segment each; longer runs are drawn as one bar in the same colours. */
const MAX_SEGMENTS = 30

/**
 * Progress through a run of steps (pages): one segment each, done, in progress (a sweeping
 * shimmer), failed or still to do. `label` names it for screen readers; the value is the done count.
 */
export function ProgressBar({ segments, label, valueText, className }: { segments: SegmentState[]; label: string; valueText?: string; className?: string }) {
  const count = (state: SegmentState) => segments.filter((s) => s === state).length
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={segments.length}
      aria-valuenow={count('done')}
      aria-valuetext={valueText}
      className={cn('flex h-2 gap-0.5', className)}
    >
      {segments.length <= MAX_SEGMENTS
        ? segments.map((state, i) => <Segment key={i} state={state} grow={1} />)
        : (['done', 'failed', 'current', 'pending'] as const).map((state) => count(state) > 0 && <Segment key={state} state={state} grow={count(state)} />)}
    </div>
  )
}

function Segment({ state, grow }: { state: SegmentState; grow: number }) {
  return (
    <span className={cn('relative min-w-1 overflow-hidden rounded-full transition-colors', SEGMENT_CLASS[state])} style={{ flex: `${grow} 1 0%` }}>
      {state === 'current' && <Shimmer />}
    </span>
  )
}
