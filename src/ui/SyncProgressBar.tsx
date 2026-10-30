import type { SyncStatus } from '@/lib/syncRunner'
import { ProgressBar, type SegmentState } from './ProgressBar'

/** Pictures in flight at once (the sync moves a few at a time). */
const IN_FLIGHT = 4

/**
 * A running sync as a bar: the picture transfer counted (done, moving, still to go); with
 * `indeterminate`, a sweeping bar while the cards sync. Nothing when not syncing.
 */
export function SyncProgressBar({ status, indeterminate = false, className }: { status: SyncStatus; indeterminate?: boolean; className?: string }) {
  if (status.kind !== 'syncing') return null
  if (!status.pictures) return indeterminate ? <ProgressBar segments={['current']} label="Syncing cards" className={className} /> : null
  const { done, total } = status.pictures
  const segments = Array.from({ length: total }, (_, i): SegmentState => (i < done ? 'done' : i < done + IN_FLIGHT ? 'current' : 'pending'))
  return <ProgressBar segments={segments} label="Syncing pictures" valueText={`${done} of ${total}`} className={className} />
}
