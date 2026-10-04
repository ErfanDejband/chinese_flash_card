import Dexie, { type EntityTable } from 'dexie'
import type { AppSettings, BBox, Card, Id, ReviewLogEntry, ReviewState, Timestamp } from '@/domain/types'
import type { DraftFields } from '@/import/types'

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
  /** SHA-256 of the PDF, used to warn when the same file is imported again ('' if unavailable). */
  fileHash: string
  pageCount: number
  status: 'draft' | 'committed' | 'discarded'
  acceptedCount: number
  rejectedCount: number
  /** Missing on imports made before image support: PDF. */
  sourceKind?: 'pdf' | 'images'
  /** AI provider and model used for extraction. */
  provider?: string
  model?: string
  createdAt: Timestamp
  updatedAt: Timestamp
}

/** One PDF page queued for / processed by AI extraction. Transient: deleted when the import is committed or discarded. */
export interface ImportPageRecord {
  /** `${importId}:${page}` */
  id: string
  importId: Id
  page: number
  /** "Page 5", "IMG_1234.jpg", "scroll.png (part 2/4)". Missing on older imports. */
  label?: string
  /** Original image file name (image imports). */
  sourceFile?: string
  /** Extra clockwise rotation chosen in the page picker. */
  rotation?: 0 | 90 | 180 | 270
  status: 'pending' | 'running' | 'done' | 'error'
  /** Rendered page (~1920 px JPEG), kept for re-cropping pictures. */
  image?: Blob
  width?: number
  height?: number
  pointWidth?: number
  pointHeight?: number
  textHint?: string
  error?: string
  model?: string
  promptVersion?: number
  /** Raw model reply, for debugging extraction problems. */
  raw?: string
  updatedAt: Timestamp
}

/** A candidate card awaiting review. Transient like ImportPageRecord. */
export interface ImportDraftRecord extends DraftFields {
  id: Id
  importId: Id
  page: number
  /** Reading order within the page. */
  order: number
  crop?: { blob: Blob; mime: string; width: number; height: number }
  /** Picture position in PDF points, stored on the card as provenance. */
  sourceBox?: BBox
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
  importPages!: EntityTable<ImportPageRecord, 'id'>
  importDrafts!: EntityTable<ImportDraftRecord, 'id'>

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
    // v2: AI-assisted PDF import work tables (new tables only, no data migration).
    this.version(2).stores({
      importPages: 'id, importId',
      importDrafts: 'id, importId, [importId+page]',
    })
  }
}

export const db = new AppDB()

export const ALL_TABLES = () => [
  db.cards,
  db.reviewStates,
  db.reviewLog,
  db.media,
  db.imports,
  db.settings,
  db.importPages,
  db.importDrafts,
]
