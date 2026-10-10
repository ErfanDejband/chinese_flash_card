import { gunzipSync, gzipSync, strFromU8, strToU8 } from 'fflate'
import { canonicalJson, contentHash, sortById } from '@/domain/sync/merge'
import type { Timestamp } from '@/domain/types'

/**
 * Layout of the synced data in the user's Drive app folder: one gzipped JSON file per table,
 * the review log split by UTC month so old months stop changing and stay small.
 */
export const SYNC_FORMAT = 'mandarin-leitner-sync'
export const SYNC_VERSION = 1

export const MANIFEST_FILE = 'manifest.json.gz'

export const TABLE_FILES = {
  cards: 'cards.json.gz',
  states: 'states.json.gz',
  imports: 'imports.json.gz',
  settings: 'settings.json.gz',
  tombstones: 'tombstones.json.gz',
} as const

export interface Manifest {
  format: typeof SYNC_FORMAT
  version: number
}

const LOG_FILE = /^log-(\d{4}-\d{2})\.json\.gz$/

/** UTC so every device puts an entry in the same file, whatever its time zone. */
export function logMonth(at: Timestamp): string {
  const d = new Date(at)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

export const logFileName = (month: string) => `log-${month}.json.gz`
export const isLogFile = (name: string) => LOG_FILE.test(name)
export const isDataFile = (name: string) => isLogFile(name) || (Object.values(TABLE_FILES) as string[]).includes(name)

export function encodeJson(value: unknown): Uint8Array {
  return gzipSync(strToU8(canonicalJson(value)))
}

export function decodeJson<T>(bytes: Uint8Array): T {
  return JSON.parse(strFromU8(gunzipSync(bytes))) as T
}

/** Identifies a file's rows regardless of their order or key order. */
export function hashRows(rows: { id: string }[]): string {
  return contentHash(canonicalJson(sortById(rows)))
}
