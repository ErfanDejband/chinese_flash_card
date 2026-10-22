import type { LeitnerConfig, ReviewResult } from '../types'
import { intervalDays, nextBox } from './scheduler'

/**
 * The box shelf demo (welcome screen, Help): one card, answered with the real scheduling rules
 * of the learner's settings.
 */
export interface DemoStep {
  box: number
  /** Days until the card comes back. */
  inDays: number
}

export function demoStep(box: number, result: ReviewResult, config: LeitnerConfig): DemoStep {
  const next = nextBox(box, result, config)
  return { box: next, inDays: intervalDays(next, config) }
}

export interface DemoDay {
  day: number
  /** The card's box at the end of the day (0 before its first review). */
  box: number
  reviewed: boolean
  /** Day of the next review. */
  nextDay: number
}

/** Day by day, a new card that is known every time it comes back: first review on day 0. */
export function demoTimeline(config: LeitnerConfig, days: number): DemoDay[] {
  const timeline: DemoDay[] = []
  let box = 0
  let nextDay = 0
  for (let day = 0; day <= days; day++) {
    const reviewed = day === nextDay
    if (reviewed) {
      const step = demoStep(box, 'knew', config)
      box = step.box
      nextDay = day + step.inDays
    }
    timeline.push({ day, box, reviewed, nextDay })
  }
  return timeline
}
