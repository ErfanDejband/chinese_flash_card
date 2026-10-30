import type { ImportRecord, SettingsRecord } from '@/data/db'
import type { Tombstone } from '@/domain/sync/merge'
import type { Card, Id, KnownWord, ReviewLogEntry, ReviewState } from '@/domain/types'

/** Settings as synced: the speech voice stays on each device (voices differ per platform). */
export type SyncedSettings = Omit<SettingsRecord, 'ttsVoiceURI'>

/** Everything this device syncs. */
export interface LocalSnapshot {
  cards: Card[]
  states: ReviewState[]
  imports: ImportRecord[]
  settings: SyncedSettings[]
  tombstones: Tombstone[]
  known: KnownWord[]
  log: ReviewLogEntry[]
}

/** Rows to write locally after a merge (all in one transaction). */
export interface LocalChanges {
  cards: Card[]
  states: ReviewState[]
  imports: ImportRecord[]
  settings: SyncedSettings[]
  tombstones: Tombstone[]
  known: KnownWord[]
  logAdds: ReviewLogEntry[]
  logDeletes: Id[]
}

/** A card picture as one device stores it (the media table). Pictures never change: a new one gets a new id. */
export interface PictureRecord {
  id: Id
  blob: Blob
  mime: string
  width: number
  height: number
  createdAt: number
}

/** This device's card pictures, for syncing them as files (sync step 2). */
export interface PictureStore {
  /** `used`: pictures of cards that aren't deleted; `stored`: pictures this device has. */
  ids(): Promise<{ used: Set<Id>; stored: Set<Id> }>
  get(id: Id): Promise<PictureRecord | undefined>
  put(picture: PictureRecord): Promise<void>
}

export interface LocalStore {
  read(): Promise<LocalSnapshot>
  apply(changes: LocalChanges): Promise<void>
  /** Replace this device's synced data with another copy (first sync, "use the Drive copy"). */
  replace(snapshot: LocalSnapshot): Promise<void>
  pictures: PictureStore
}

export interface RemoteFile {
  id: string
  name: string
  /** Changes on every write (Drive's file version). */
  version: string
}

/** The few Drive calls sync needs; `src/sync/drive.ts` implements them over the REST API. */
export interface DriveLike {
  list(): Promise<RemoteFile[]>
  download(id: string): Promise<Uint8Array>
  create(name: string, data: Uint8Array): Promise<RemoteFile>
  update(id: string, data: Uint8Array): Promise<RemoteFile>
  /** Delete a file (a picture no card uses any more); a file that is already gone is fine. */
  remove(id: string): Promise<void>
}

/** What this device last saw of each remote file. */
export interface FileState {
  id: string
  version: string
  hash: string
}

export type SyncFiles = Record<string, FileState>

export type SyncErrorKind = 'auth' | 'network' | 'rate-limit' | 'server' | 'format' | 'other'

export class SyncError extends Error {
  readonly kind: SyncErrorKind
  readonly status?: number

  constructor(kind: SyncErrorKind, message: string, status?: number) {
    super(message)
    this.name = 'SyncError'
    this.kind = kind
    this.status = status
  }
}
