import { defaultSettings, REVIEW_MODES, validateLeitnerConfig } from '@/domain/leitner/config'
import type { AppSettings } from '@/domain/types'
import { db } from '../db'

export async function getSettings(): Promise<AppSettings> {
  const row = await db.settings.get('app')
  if (!row) return defaultSettings(0)
  const { id: _id, ...settings } = row
  return { ...defaultSettings(0), ...settings }
}

export type SettingsInput = Omit<AppSettings, 'updatedAt'>

export function validateSettings(s: SettingsInput): string[] {
  const errors = validateLeitnerConfig(s.leitner)
  if (!Number.isInteger(s.newPerDay) || s.newPerDay < 0 || s.newPerDay > 500) {
    errors.push('New cards per day must be a whole number between 0 and 500.')
  }
  if (!REVIEW_MODES.includes(s.reviewMode)) errors.push('Unknown practice direction.')
  return errors
}

export async function saveSettings(s: SettingsInput, now = Date.now()): Promise<AppSettings> {
  const errors = validateSettings(s)
  if (errors.length) throw new Error(errors.join('\n'))
  const next: AppSettings = { ...s, updatedAt: now }
  await db.settings.put({ ...next, id: 'app' })
  return next
}
