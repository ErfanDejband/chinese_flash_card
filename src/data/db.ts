import Dexie, { type EntityTable } from 'dexie'
import type { AppSettings, BBox, Card, Id, KnownWord, ReviewLogEntry, ReviewState, Timestamp } from '@/domain/types'
import type { Tombstone } from '@/domain/sync/merge'
import type { DraftFields, ImportMode, NormBox, ReadingSentence } from '@/import/types'
import type { SheetSize } from '@/pictures/sheet'
import type { PictureStyleId } from '@/pictures/styles'
import type { PicturePlan, PictureService } from '@/pictures/types'

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
  /** What the pages hold; missing on imports made before reading pages: vocabulary. */
  mode?: ImportMode
  /** AI provider and model used for extraction. */
  provider?: string
  model?: string
  /** The import demo's sample page: no AI, and its cards are tagged as sample cards. */
  demo?: boolean
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
  /** Reading pages: the sentences split into words, for the reader. */
  reading?: ReadingSentence[]
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

/** A picture as stored (same shape as a card image). */
export interface PictureBlob {
  blob: Blob
  mime: string
  width: number
  height: number
}

/**
 * Making pictures for a set of cards. Work tables like the import ones: device-only, not synced
 * or backed up, deleted when the pictures are saved or discarded.
 */
export interface PictureJobRecord {
  id: Id
  /** Where the cards came from (for the way back). */
  from: 'import' | 'cards'
  /** planning → choosing the method (setup) → making the pictures (running) → keep / redo (review). */
  status: 'planning' | 'setup' | 'running' | 'review'
  /** Set when a run starts. */
  method?: 'paid' | 'emoji'
  style?: PictureStyleId
  perSheet?: SheetSize
  service?: PictureService
  model?: string
  /** The planning call failed or there was no AI: plans are just the meanings. */
  planFailed?: boolean
  createdAt: Timestamp
  updatedAt: Timestamp
}

/** One generated image holding several pictures (or four versions of one word). */
export interface PictureSheetRecord {
  id: Id
  jobId: Id
  /** Run order. */
  order: number
  /** Card per cell, in cell order. A variants sheet has one card. */
  cardIds: Id[]
  variants: boolean
  status: 'pending' | 'done' | 'error'
  image?: Blob
  width?: number
  height?: number
  /** Crop box per cell (variants: 4). */
  boxes?: NormBox[]
  error?: string
  updatedAt: Timestamp
}

/** One card's picture in a job. */
export interface PictureDraftRecord {
  /** `${jobId}:${cardId}` */
  id: string
  jobId: Id
  cardId: Id
  order: number
  /** The card's words when the job started (for prompts and the grid). */
  hanzi: string
  pinyin: string
  meaning: string
  plan?: PicturePlan
  /** Make a picture for this card (picturable, or "try anyway"). */
  include: boolean
  status: 'waiting' | 'ready' | 'failed'
  picture?: PictureBlob
  /** Where the picture was cut from, for adjusting the crop. */
  sheetId?: Id
  cell?: number
  box?: NormBox
  /** Save this picture to the card. */
  keep: boolean
  /** Four versions to choose from (Regenerate), cut from `optionsSheetId`. */
  options?: PictureBlob[]
  optionsSheetId?: Id
  error?: string
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
  /** Review-log entries deleted by undo, so sync can delete them on other devices too. */
  syncTombstones!: EntityTable<Tombstone, 'id'>
  knownWords!: EntityTable<KnownWord, 'id'>
  pictureJobs!: EntityTable<PictureJobRecord, 'id'>
  pictureSheets!: EntityTable<PictureSheetRecord, 'id'>
  pictureDrafts!: EntityTable<PictureDraftRecord, 'id'>

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
    // v3: sync tombstones (new table only).
    this.version(3).stores({ syncTombstones: 'id' })
    // v4: words the learner already knows (new table only).
    this.version(4).stores({ knownWords: 'id' })
    // v5: picture-making work tables (new tables only).
    this.version(5).stores({ pictureJobs: 'id', pictureSheets: 'id, jobId', pictureDrafts: 'id, jobId' })
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
  db.syncTombstones,
  db.knownWords,
  db.pictureJobs,
  db.pictureSheets,
  db.pictureDrafts,
]
