import type { Id, ReviewLogEntry, Timestamp } from '../types'

/**
 * Merge rules for sync, shared by every device. They are commutative and idempotent, so
 * two devices that merge each other's data in any order end up with the same rows.
 */

/** A row that may change: the newer `updatedAt` wins. */
export interface Versioned {
  id: string
  updatedAt: Timestamp
}

/** Marks a review-log entry that was deleted (undo), so other devices drop their copy too. */
export interface Tombstone {
  id: Id
  deletedAt: Timestamp
}

/** JSON with object keys sorted, so equal data always serialises to the same string. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) => {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return v
    const sorted: Record<string, unknown> = {}
    for (const k of Object.keys(v).sort()) sorted[k] = (v as Record<string, unknown>)[k]
    return sorted
  })
}

/** Fast 53-bit string hash (cyrb53), used to notice changed files. Not for security. */
export function contentHash(text: string): string {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 2654435761)
    h2 = Math.imul(h2 ^ c, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36)
}

const byId = <T extends { id: string }>(a: T, b: T) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

/** Rows sorted by id, the order every synced file uses. */
export function sortById<T extends { id: string }>(rows: T[]): T[] {
  return [...rows].sort(byId)
}

/** Which of two versions of a row to keep: the newer one; on a tie, the canonically greater one. */
function winner<T extends Versioned>(a: T, b: T): T {
  if (a.updatedAt !== b.updatedAt) return a.updatedAt > b.updatedAt ? a : b
  return canonicalJson(a) >= canonicalJson(b) ? a : b
}

export interface MergeResult<T> {
  /** Every row after the merge, sorted by id. */
  merged: T[]
  /** Remote rows that are new here or replace the local version. */
  localUpdates: T[]
}

/** Last-write-wins per row. */
export function mergeVersioned<T extends Versioned>(local: T[], remote: T[]): MergeResult<T> {
  const rows = new Map(local.map((r) => [r.id, r]))
  const localUpdates: T[] = []
  for (const r of remote) {
    const mine = rows.get(r.id)
    const keep = mine ? winner(mine, r) : r
    if (keep !== mine && canonicalJson(keep) !== canonicalJson(mine)) {
      rows.set(r.id, keep)
      localUpdates.push(keep)
    }
  }
  return { merged: sortById([...rows.values()]), localUpdates }
}

export function mergeTombstones(local: Tombstone[], remote: Tombstone[]): MergeResult<Tombstone> {
  const rows = new Map(local.map((t) => [t.id, t]))
  const localUpdates: Tombstone[] = []
  for (const t of remote) {
    const mine = rows.get(t.id)
    // Keep the earliest deletion time so both devices agree on the row.
    if (!mine || t.deletedAt < mine.deletedAt) {
      rows.set(t.id, t)
      localUpdates.push(t)
    }
  }
  return { merged: sortById([...rows.values()]), localUpdates }
}

export interface LogMergeResult {
  merged: ReviewLogEntry[]
  /** Remote entries this device doesn't have yet. */
  localAdds: ReviewLogEntry[]
  /** Local entries deleted on another device. */
  localDeletes: Id[]
}

/** The review log only grows, except for entries undone somewhere (tombstones). */
export function mergeLog(local: ReviewLogEntry[], remote: ReviewLogEntry[], deleted: ReadonlySet<Id>): LogMergeResult {
  const rows = new Map<Id, ReviewLogEntry>()
  const localDeletes: Id[] = []
  for (const e of local) {
    if (deleted.has(e.id)) localDeletes.push(e.id)
    else rows.set(e.id, e)
  }
  const localAdds: ReviewLogEntry[] = []
  for (const e of remote) {
    if (deleted.has(e.id) || rows.has(e.id)) continue
    rows.set(e.id, e)
    localAdds.push(e)
  }
  return { merged: sortById([...rows.values()]), localAdds, localDeletes }
}
