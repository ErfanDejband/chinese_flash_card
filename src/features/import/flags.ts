import { containsHan } from '@/domain/cjk'
import { checkPinyin } from '@/domain/pinyin/suggest'
import type { DraftFlag } from '@/import/types'

type Tone = 'info' | 'check' | 'problem'

export const FLAG_INFO: Record<DraftFlag, { label: string; tone: Tone }> = {
  'hanzi-inferred': { label: 'characters guessed by AI', tone: 'check' },
  'pinyin-inferred': { label: 'pinyin added by AI', tone: 'info' },
  'meaning-inferred': { label: 'meaning by AI', tone: 'info' },
  'pinyin-mismatch': { label: 'pinyin doesn’t match characters', tone: 'problem' },
  'tone-differs': { label: 'tone differs from dictionary', tone: 'info' },
  'no-han': { label: 'no Chinese characters', tone: 'problem' },
  'maybe-simplified': { label: 'looks Simplified', tone: 'problem' },
  'duplicate-existing': { label: 'already in your cards', tone: 'check' },
  'duplicate-import': { label: 'duplicate in this import', tone: 'check' },
  'low-confidence': { label: 'AI unsure', tone: 'check' },
}

export const TONE_CLASS: Record<Tone, string> = {
  info: 'bg-sunken text-muted',
  check: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200',
  problem: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200',
}

const LIVE: ReadonlySet<DraftFlag> = new Set(['pinyin-mismatch', 'tone-differs', 'no-han'])

/** Flags as stored at extraction, with the character/pinyin checks recomputed for the current values. */
export function liveFlags(stored: DraftFlag[], hanzi: string, pinyin: string): DraftFlag[] {
  const flags = stored.filter((f) => !LIVE.has(f))
  if (!containsHan(hanzi)) return [...flags, 'no-han']
  const check = checkPinyin(hanzi, pinyin)
  if (check === 'mismatch') flags.push('pinyin-mismatch')
  if (check === 'tone-differs') flags.push('tone-differs')
  return flags
}
