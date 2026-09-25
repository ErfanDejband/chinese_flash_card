import Dexie, { type EntityTable } from 'dexie'
import type { AppSettings, Card, Id, ReviewLogEntry, ReviewState, Timestamp } from '@/domain/types'

/** Binary media (card images, later audio), stored as Blobs next to the cards. */
export interface MediaRecord {
  id: Id
  blob: Blob
  mime: string
  width: number
  height: number
  createdAt: Timestamp
}

/** One PDF import. Cards reference it through `source.importId`. */
export interface ImportRecord {
  id: Id
  fileName: string
  /** SHA-256 of the PDF, used to warn when the same file is imported again. */
  fileHash: string
  pageCount: number
  status: 'draft' | 'committed' | 'discarded'
  acceptedCount: number
  rejectedCount: number
  createdAt: Timestamp
  updatedAt: Timestamp
}

export interface SettingsRecord extends AppSettings {
  id: 'app'
}

export const DB_NAME = 'mandarin-leitner'

/**
 * IndexedDB schema. Only indexed fields are listed; each schema change needs a new
 * `version(n)` with an upgrade function if existing rows must be transformed.
 */
export class AppDB extends Dexie {
  cards!: EntityTable<Card, 'id'>
  reviewStates!: EntityTable<ReviewState, 'id'>
  reviewLog!: EntityTable<ReviewLogEntry, 'id'>
  media!: EntityTable<MediaRecord, 'id'>
  imports!: EntityTable<ImportRecord, 'id'>
  settings!: EntityTable<SettingsRecord, 'id'>

  constructor(name = DB_NAME) {
    super(name)
    this.version(1).stores({
      cards: 'id, hanzi, createdAt, updatedAt',
      reviewStates: 'id, cardId, [mode+box], updatedAt',
      reviewLog: 'id, cardId, at',
      media: 'id',
      imports: 'id, fileHash, createdAt',
      settings: 'id',
    })
  }
}

export const db = new AppDB()

export const ALL_TABLES = () => [db.cards, db.reviewStates, db.reviewLog, db.media, db.imports, db.settings]
