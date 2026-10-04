/** Core domain types. Pure data: no persistence or UI concerns. */

export type Id = string

/** Calendar day in the user's local time zone, formatted `YYYY-MM-DD` (sortable as a string). */
export type LocalDate = string

/** Epoch milliseconds. */
export type Timestamp = number

/**
 * A review mode is one "direction" of practice. Each (card, mode) pair has its own Leitner state,
 * so new modes (hanzi → pinyin, listening, ...) can be added without migrating existing progress.
 */
export type ReviewMode = 'image_to_word' | 'hanzi_to_meaning'

export type ReviewResult = 'knew' | 'forgot'

/** Rectangle in PDF page units (points), origin at the top-left of the page. */
export interface BBox {
  x: number
  y: number
  width: number
  height: number
}

export type CardSource =
  | { type: 'manual' }
  | { type: 'pdf'; importId: Id; fileName: string; page: number; bbox?: BBox }
  /** A photo or screenshot; bbox in the image's pixels. */
  | { type: 'image'; importId: Id; fileName: string; bbox?: BBox }

/** A vocabulary item: content only. Scheduling lives in {@link ReviewState}. */
export interface Card {
  id: Id
  hanzi: string
  /** Pinyin with tone marks, e.g. `lǎoshī`. */
  pinyin: string
  meaning?: string
  notes?: string
  imageId?: Id
  audioId?: Id
  tags: string[]
  deckId: Id
  source: CardSource
  createdAt: Timestamp
  updatedAt: Timestamp
  /** Soft delete, kept so a future sync can propagate deletions. */
  deletedAt?: Timestamp
}

/** Leitner state of one card in one review mode. */
export interface ReviewState {
  /** `${cardId}:${mode}` */
  id: string
  cardId: Id
  mode: ReviewMode
  /** 0 = not started (waiting in the new-card pool), 1..N = Leitner box. */
  box: number
  /** Day the card is next due; null while not started. */
  dueOn: LocalDate | null
  /** Day the card left the new-card pool (its first answer). */
  introducedOn: LocalDate | null
  lastReviewedAt: Timestamp | null
  reviewCount: number
  lapseCount: number
  updatedAt: Timestamp
}

/** Append-only record of every scheduling answer. */
export interface ReviewLogEntry {
  id: Id
  cardId: Id
  mode: ReviewMode
  at: Timestamp
  result: ReviewResult
  fromBox: number
  toBox: number
}

export interface BoxConfig {
  intervalDays: number
}

export interface LeitnerConfig {
  /** Box 1 is `boxes[0]`. */
  boxes: BoxConfig[]
  /** `reset`: a forgotten card goes back to box 1. `demote`: it drops one box. */
  onFail: 'reset' | 'demote'
}

export interface AppSettings {
  leitner: LeitnerConfig
  /** Max new cards introduced per day. */
  newPerDay: number
  /** Direction being practised; each direction has its own boxes. */
  reviewMode: ReviewMode
  /** Preferred speech-synthesis voice (voiceURI), if the user picked one. */
  ttsVoiceURI?: string
  updatedAt: Timestamp
}
