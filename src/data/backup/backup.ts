import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate'
import type { Card, ReviewLogEntry, ReviewState } from '@/domain/types'
import { ALL_TABLES, db, type ImportRecord, type MediaRecord, type SettingsRecord } from '../db'

/**
 * Backup = zip of JSON tables + raw media files. Doubles as the way to move data between
 * devices until cloud sync exists, which is why "merge" is last-write-wins per row.
 */
export const BACKUP_FORMAT = 'mandarin-leitner-backup'
export const BACKUP_VERSION = 1

interface Manifest {
  format: typeof BACKUP_FORMAT
  version: number
  exportedAt: number
}

type MediaMeta = Omit<MediaRecord, 'blob'>

interface Tables {
  cards: Card[]
  reviewStates: ReviewState[]
  reviewLog: ReviewLogEntry[]
  imports: ImportRecord[]
  settings: SettingsRecord[]
  media: MediaMeta[]
}

const TABLE_FILES = ['cards', 'reviewStates', 'reviewLog', 'imports', 'settings', 'media'] as const

const json = (value: unknown) => strToU8(JSON.stringify(value))

export async function exportBackup(now = Date.now()): Promise<Uint8Array> {
  const [cards, reviewStates, reviewLog, imports, settings, media] = await Promise.all([
    db.cards.toArray(),
    db.reviewStates.toArray(),
    db.reviewLog.toArray(),
    db.imports.toArray(),
    db.settings.toArray(),
    db.media.toArray(),
  ])
  const manifest: Manifest = { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: now }
  const files: Zippable = {
    'manifest.json': json(manifest),
    'cards.json': json(cards),
    'reviewStates.json': json(reviewStates),
    'reviewLog.json': json(reviewLog),
    'imports.json': json(imports),
    'settings.json': json(settings),
    'media.json': json(media.map(({ blob: _blob, ...meta }) => meta)),
  }
  for (const m of media) {
    // Images are already compressed; store them as-is.
    files[`media/${m.id}`] = [new Uint8Array(await m.blob.arrayBuffer()), { level: 0 }]
  }
  return zipSync(files)
}

export class BackupFormatError extends Error {}

function readBackup(bytes: Uint8Array): { tables: Tables; mediaFiles: Map<string, Uint8Array> } {
  let files: Record<string, Uint8Array>
  try {
    files = unzipSync(bytes)
  } catch {
    throw new BackupFormatError('This file is not a backup zip.')
  }
  const read = (name: string): unknown => {
    const f = files[name]
    if (!f) throw new BackupFormatError(`Backup is missing ${name}.`)
    return JSON.parse(strFromU8(f))
  }
  const manifest = read('manifest.json') as Partial<Manifest>
  if (manifest.format !== BACKUP_FORMAT) throw new BackupFormatError('This file is not a Mandarin Leitner backup.')
  if (typeof manifest.version !== 'number' || manifest.version > BACKUP_VERSION) {
    throw new BackupFormatError('This backup was made by a newer version of the app. Update the app first.')
  }
  const tables = {} as Record<(typeof TABLE_FILES)[number], unknown>
  for (const t of TABLE_FILES) {
    const rows = read(`${t}.json`)
    if (!Array.isArray(rows)) throw new BackupFormatError(`Backup table ${t} is malformed.`)
    tables[t] = rows
  }
  const mediaFiles = new Map<string, Uint8Array>()
  for (const [name, data] of Object.entries(files)) {
    if (name.startsWith('media/')) mediaFiles.set(name.slice('media/'.length), data)
  }
  return { tables: tables as unknown as Tables, mediaFiles }
}

export interface RestoreResult {
  cards: number
  media: number
  reviews: number
}

type Versioned = { id: string; updatedAt: number }

/** Last-write-wins: the incoming rows that are new or newer than the local copy. */
async function newerRows<T extends Versioned>(rows: T[], bulkGet: (ids: string[]) => Promise<(T | undefined)[]>): Promise<T[]> {
  const existing = await bulkGet(rows.map((r) => r.id))
  return rows.filter((r, i) => !existing[i] || r.updatedAt > existing[i]!.updatedAt)
}

/**
 * `replace`: wipe local data and load the backup.
 * `merge`: keep whichever version of each row is newer; review logs and media are unioned.
 */
export async function restoreBackup(bytes: Uint8Array, mode: 'merge' | 'replace'): Promise<RestoreResult> {
  const { tables, mediaFiles } = readBackup(bytes)
  const media: MediaRecord[] = tables.media.flatMap((meta) => {
    const data = mediaFiles.get(meta.id)
    return data ? [{ ...meta, blob: new Blob([data as Uint8Array<ArrayBuffer>], { type: meta.mime }) }] : []
  })

  return db.transaction('rw', ALL_TABLES(), async () => {
    if (mode === 'replace') {
      await Promise.all(ALL_TABLES().map((t) => t.clear()))
      await db.cards.bulkPut(tables.cards)
      await db.reviewStates.bulkPut(tables.reviewStates)
      await db.reviewLog.bulkPut(tables.reviewLog)
      await db.imports.bulkPut(tables.imports)
      await db.settings.bulkPut(tables.settings)
      await db.media.bulkPut(media)
      return { cards: tables.cards.length, media: media.length, reviews: tables.reviewLog.length }
    }

    const cards = await newerRows(tables.cards, (ids) => db.cards.bulkGet(ids))
    await db.cards.bulkPut(cards)
    await db.reviewStates.bulkPut(await newerRows(tables.reviewStates, (ids) => db.reviewStates.bulkGet(ids)))
    await db.imports.bulkPut(await newerRows(tables.imports, (ids) => db.imports.bulkGet(ids)))
    await db.settings.bulkPut(await newerRows(tables.settings, (ids) => db.settings.bulkGet(ids as 'app'[])))

    const haveLog = new Set(await db.reviewLog.toCollection().primaryKeys())
    const newLog = tables.reviewLog.filter((l) => !haveLog.has(l.id))
    await db.reviewLog.bulkAdd(newLog)

    const haveMedia = new Set(await db.media.toCollection().primaryKeys())
    const newMedia = media.filter((m) => !haveMedia.has(m.id))
    await db.media.bulkAdd(newMedia)

    return { cards: cards.length, media: newMedia.length, reviews: newLog.length }
  })
}
