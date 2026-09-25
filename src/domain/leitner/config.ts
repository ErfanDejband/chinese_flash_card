import type { AppSettings, LeitnerConfig } from '../types'

export const DEFAULT_LEITNER: LeitnerConfig = {
  boxes: [1, 2, 4, 7, 14].map((intervalDays) => ({ intervalDays })),
  onFail: 'reset',
}

export const DEFAULT_NEW_PER_DAY = 15

export const MIN_BOXES = 3
export const MAX_BOXES = 10

export function defaultSettings(now: number): AppSettings {
  return { leitner: DEFAULT_LEITNER, newPerDay: DEFAULT_NEW_PER_DAY, updatedAt: now }
}

/** Returns a list of problems; empty when the config is valid. */
export function validateLeitnerConfig(config: LeitnerConfig): string[] {
  const errors: string[] = []
  const n = config.boxes.length
  if (n < MIN_BOXES || n > MAX_BOXES) errors.push(`Use between ${MIN_BOXES} and ${MAX_BOXES} boxes.`)
  config.boxes.forEach((b, i) => {
    if (!Number.isInteger(b.intervalDays) || b.intervalDays < 1 || b.intervalDays > 365) {
      errors.push(`Box ${i + 1}: interval must be a whole number of days between 1 and 365.`)
    }
  })
  for (let i = 1; i < n; i++) {
    if (config.boxes[i]!.intervalDays < config.boxes[i - 1]!.intervalDays) {
      errors.push(`Box ${i + 1}: interval should not be shorter than box ${i}.`)
    }
  }
  return errors
}
