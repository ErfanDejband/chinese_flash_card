import type { ImportRecord, SettingsRecord } from '@/data/db'
import type { Tombstone } from '@/domain/sync/merge'
import type { Card, Id, ReviewLogEntry, ReviewState } from '@/domain/types'

/** Settings as synced: the speech voice stays on each device (voices differ per platform). */
export type SyncedSettings = Omit<SettingsRecord, 'ttsVoiceURI'>

/** Everything this device syncs. */
export interface LocalSnapshot {
  cards: Card[]
  states: ReviewState[]
  imports: ImportRecord[]
  settings: SyncedSettings[]
  tombstones: Tombstone[]
  log: ReviewLogEntry[]
}

/** Rows to write locally after a merge (all in one transaction). */
export interface LocalChanges {
  cards: Card[]
  states: ReviewState[]
  imports: ImportRecord[]
  settings: SyncedSettings[]
  tombstones: Tombstone[]
  logAdds: ReviewLogEntry[]
  logDeletes: Id[]
}

export interface LocalStore {
  read(): Promise<LocalSnapshot>
  apply(changes: LocalChanges): Promise<void>
  /** Replace this device's synced data with another copy (first sync, "use the Drive copy"). */
  replace(snapshot: LocalSnapshot): Promise<void>
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
