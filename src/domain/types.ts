/** Core domain types. Pure data: no persistence or UI concerns. */

export type Id = string

/** Calendar day in the user's local time zone, formatted `YYYY-MM-DD` (sortable as a string). */
export type LocalDate = string

/** Epoch milliseconds. */
export type Timestamp = number

/**
 * A review mode is one "direction" of practice: picture → Chinese, Chinese → meaning, or listening
 * (the word is spoken). Each (card, mode) pair has its own Leitner state, so new modes can be added
 * without migrating existing progress.
 */
export type ReviewMode = 'image_to_word' | 'hanzi_to_meaning' | 'listening'

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

/** A sentence that shows a word in use. */
export interface Example {
  hanzi: string
  pinyin: string
  meaning: string
}

/** A vocabulary item: content only. Scheduling lives in {@link ReviewState}. */
export interface Card {
  id: Id
  hanzi: string
  /** Pinyin with tone marks, e.g. `lǎoshī`. */
  pinyin: string
  meaning?: string
  notes?: string
  /** The sentence the word was learned from (reading imports), shown with the answer. */
  example?: Example
  imageId?: Id
  audioId?: Id
  tags: string[]
  /** The deck it belongs to; `'default'` = My cards (no deck). */
  deckId: Id
  /** The lesson within its deck, if any. */
  lessonId?: Id
  source: CardSource
  createdAt: Timestamp
  updatedAt: Timestamp
  /** Soft delete, kept so a future sync can propagate deletions. */
  deletedAt?: Timestamp
}

/**
 * A named group of cards (a textbook, a class), optionally split into lessons. Cards point to it
 * through `Card.deckId`. Soft delete, so sync carries it to other devices.
 */
export interface Deck {
  id: Id
  title: string
  description?: string
  /** Position in the deck list. */
  order: number
  /** The teacher's name shown to students (a shared or joined class). */
  teacher?: string
  /** Teacher side: this deck is shared as a class from the teacher's Drive. */
  share?: DeckShare
  /** Student side: this deck is a class joined from a teacher; its cards follow the teacher's. */
  remote?: DeckRemote
  createdAt: Timestamp
  updatedAt: Timestamp
  deletedAt?: Timestamp
}

/** A class lock: the class files are encrypted with a key made from the teacher's password. */
export interface ClassLock {
  /** Base64 salt and PBKDF2 iterations, published so students can make the same key. */
  salt: string
  iterations: number
  /** The key itself (base64), kept on the teacher's own rows so each of their devices can publish. */
  key: string
}

/** Where a shared class lives in the teacher's Drive, and what was last published. */
export interface DeckShare {
  folderId: string
  /** The class file students open; its id is in the link and never changes. */
  manifestId: string
  /** Per lesson: its Drive file and the hash of what was published. */
  lessons: Record<Id, { file: string; hash: string }>
  /** Per picture (media id): its Drive file. */
  pictures: Record<Id, string>
  /** Hash of the class details (title, teacher, lesson titles and order). */
  manifestHash: string
  lock?: ClassLock
  publishedAt: Timestamp
}

/** A class a student joined: where it comes from and which lessons they took. */
export interface DeckRemote {
  /** The class file's Drive id; empty for a class opened from a file (no updates). */
  manifestId: string
  /** The key for a locked class (base64), once the student typed the password. */
  key?: string
  /** Lessons the student took, with the hash of the version applied. */
  lessons: Record<Id, string>
  /** Every lesson the class had at the last look, so new ones can be pointed out. */
  seen: Id[]
  /** The teacher stopped sharing (the class file is gone). */
  stopped?: boolean
}

/** A part of a deck (Lesson 3). Cards point to it through `Card.lessonId`. */
export interface Lesson {
  id: Id
  deckId: Id
  title: string
  /** Position within the deck: new cards are introduced lesson by lesson in this order. */
  order: number
  /** A shared class leaves this lesson out until the teacher shows it. */
  hidden?: boolean
  createdAt: Timestamp
  updatedAt: Timestamp
  deletedAt?: Timestamp
}

/**
 * A word the learner already knows but has no card for (我, 是, 的): imports switch it off.
 * Removing one is a soft delete so sync can carry it to other devices.
 */
export interface KnownWord {
  /** The characters. */
  id: string
  addedAt: Timestamp
  updatedAt: Timestamp
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
