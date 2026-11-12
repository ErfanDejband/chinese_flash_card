import { gunzipSync, gzipSync, strFromU8, strToU8 } from 'fflate'
import { byOrder, isActive } from '@/domain/library'
import { canonicalJson, contentHash } from '@/domain/sync/merge'
import type { Card, Deck, Example, Id, Lesson, Timestamp } from '@/domain/types'
import { fromBase64, seal, toBase64, unseal } from './crypto'

/**
 * A shared class, as files (ADR 0013): a manifest (`class.json`) that students open by its id,
 * one file per lesson with its cards, and one file per picture. The same pieces make a class
 * file (.zip). Only card content is shared, never anyone's progress.
 */
export const CLASS_FORMAT = 'mandarin-leitner-class'
export const CLASS_VERSION = 1

export type ClassErrorKind = 'format' | 'newer' | 'password' | 'not-found' | 'network' | 'auth' | 'sharing-blocked' | 'rate-limit' | 'other'

export class ClassError extends Error {
  constructor(
    readonly kind: ClassErrorKind,
    message: string,
    readonly status?: number,
  ) {
    super(message)
  }
}

/** A card as a class shares it. */
export interface ClassCard {
  id: Id
  hanzi: string
  pinyin: string
  meaning?: string
  notes?: string
  example?: Example
  tags: string[]
  imageId?: Id
  createdAt: Timestamp
  updatedAt: Timestamp
}

export interface ClassLessonInfo {
  id: Id
  title: string
  order: number
  /** Hash of the lesson's cards: a student fetches the lesson again only when it changes. */
  hash: string
  cards: number
  /** Drive file id (shared classes only). */
  file?: string
}

export interface ClassPictureInfo {
  mime: string
  width: number
  height: number
  file?: string
}

/** What the class holds; sealed (encrypted) in a locked class. */
export interface ClassBody {
  description?: string
  lessons: ClassLessonInfo[]
  pictures: Record<Id, ClassPictureInfo>
}

export interface ClassManifest {
  format: typeof CLASS_FORMAT
  version: number
  /** The teacher's deck id; a joined class keeps it. */
  id: Id
  title: string
  teacher?: string
  updatedAt: Timestamp
  /** A locked class: how to make the key from the password. */
  lock?: { salt: string; iterations: number }
  body?: ClassBody
  /** The body, encrypted (base64), when locked. */
  sealed?: string
}

export function classCard(card: Card): ClassCard {
  const { id, hanzi, pinyin, meaning, notes, example, tags, imageId, createdAt, updatedAt } = card
  return { id, hanzi, pinyin, meaning, notes, example, tags, imageId, createdAt, updatedAt }
}

export const hashOf = (value: unknown) => contentHash(canonicalJson(value))

export const encodeJson = (value: unknown) => gzipSync(strToU8(canonicalJson(value)))
export const decodeJson = <T>(bytes: Uint8Array): T => JSON.parse(strFromU8(gunzipSync(bytes))) as T

/** A lesson's (or picture's) bytes as stored: gzipped JSON, encrypted when the class is locked. */
export const encodePart = (data: Uint8Array, key?: string) => (key ? seal(data, key) : Promise.resolve(data))

export async function decodePart(data: Uint8Array, key?: string): Promise<Uint8Array> {
  if (!key) return data
  try {
    return await unseal(data, key)
  } catch {
    throw new ClassError('password', 'This class needs its password.')
  }
}

export interface PackedLesson {
  id: Id
  title: string
  order: number
  cards: ClassCard[]
  hash: string
}

/** The id of the lesson that holds a deck's cards without a lesson. */
export const looseLessonId = (deckId: Id) => `${deckId}:more`

/**
 * What a deck shares: its lessons that aren't hidden, in order, with their cards in the order
 * they were added; cards in no lesson go into a last lesson ("More cards", or the deck's title
 * when it has no lessons).
 */
export function packLessons(deck: Deck, lessons: readonly Lesson[], cards: readonly Card[]): PackedLesson[] {
  const own = lessons.filter((l) => l.deckId === deck.id && isActive(l)).sort(byOrder)
  const live = new Set(own.map((l) => l.id))
  const inDeck = cards.filter((c) => c.deckId === deck.id && isActive(c)).sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : 1))
  const pack = (id: Id, title: string, order: number, list: Card[]): PackedLesson => {
    const shared = list.map(classCard)
    return { id, title, order, cards: shared, hash: hashOf(shared) }
  }
  const packed = own.filter((l) => !l.hidden).map((l, i) => pack(l.id, l.title, i, inDeck.filter((c) => c.lessonId === l.id)))
  const loose = inDeck.filter((c) => !c.lessonId || !live.has(c.lessonId))
  if (loose.length) packed.push(pack(looseLessonId(deck.id), own.length ? 'More cards' : deck.title, packed.length, loose))
  return packed.filter((l) => l.cards.length > 0)
}

/** The class details students see; their hash tells whether the manifest must be published again. */
export function classDetails(deck: Deck, lessons: readonly PackedLesson[]) {
  return { title: deck.title, teacher: deck.teacher, description: deck.description, lessons: lessons.map((l) => [l.id, l.title, l.order, l.hash]) }
}

export async function buildManifest(deck: Deck, body: ClassBody, lock: { salt: string; iterations: number; key: string } | undefined, now: Timestamp): Promise<ClassManifest> {
  const head = { format: CLASS_FORMAT, version: CLASS_VERSION, id: deck.id, title: deck.title, ...(deck.teacher ? { teacher: deck.teacher } : {}), updatedAt: now } as const
  if (!lock) return { ...head, body }
  return { ...head, lock: { salt: lock.salt, iterations: lock.iterations }, sealed: toBase64(await seal(encodeJson(body), lock.key)) }
}

/** Reads a manifest; a newer format or someone else's file is refused. */
export function parseManifest(bytes: Uint8Array): ClassManifest {
  let manifest: Partial<ClassManifest>
  try {
    manifest = decodeJson<Partial<ClassManifest>>(bytes)
  } catch {
    throw new ClassError('format', 'This isn’t a Mandarin Leitner class.')
  }
  if (manifest.format !== CLASS_FORMAT || typeof manifest.id !== 'string') throw new ClassError('format', 'This isn’t a Mandarin Leitner class.')
  if (typeof manifest.version !== 'number' || manifest.version > CLASS_VERSION) throw new ClassError('newer', 'This class was shared by a newer version of the app. Update the app first.')
  return manifest as ClassManifest
}

/** The class body: as it is, or decrypted with the key from the password. */
export async function openBody(manifest: ClassManifest, key?: string): Promise<ClassBody> {
  if (manifest.body) return manifest.body
  if (!manifest.sealed || !key) throw new ClassError('password', 'This class needs its password.')
  return decodeJson<ClassBody>(await decodePart(fromBase64(manifest.sealed), key))
}
