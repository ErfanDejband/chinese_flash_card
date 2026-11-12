import type { ClassStore } from '@/classes/join'
import type { PublishSource } from '@/classes/publish'
import { newReviewState } from '@/domain/leitner/scheduler'
import { isActive, nextOrder } from '@/domain/library'
import type { Card, DeckShare, Id } from '@/domain/types'
import { db as defaultDb, type AppDB } from '../db'
import { DEFAULT_MODE } from './cards'

/** Joining and updating classes on this device (see classes/join.ts). */
export function createClassStore(database: AppDB = defaultDb): ClassStore {
  return {
    async local(deckId, cardIds) {
      const [deck, lessons, inDeck, byId] = await Promise.all([
        database.decks.get(deckId),
        database.lessons.where('deckId').equals(deckId).toArray(),
        database.cards.filter((c) => c.deckId === deckId).toArray(),
        database.cards.bulkGet([...cardIds]),
      ])
      const cards = new Map<Id, Card>(inDeck.map((c) => [c.id, c]))
      for (const c of byId) if (c) cards.set(c.id, c)
      return { deck, lessons, cards: [...cards.values()] }
    },

    async write(plan, pictures) {
      await database.transaction('rw', [database.decks, database.lessons, database.cards, database.reviewStates, database.media], async () => {
        const now = plan.deck.updatedAt
        await database.decks.put(plan.deck)
        await database.lessons.bulkPut(plan.lessons)
        await database.cards.bulkPut(plan.cards)
        const states = await database.reviewStates.bulkGet(plan.added.map((id) => `${id}:${DEFAULT_MODE}`))
        await database.reviewStates.bulkAdd(plan.added.filter((_, i) => !states[i]).map((id) => newReviewState(id, DEFAULT_MODE, now)))
        const have = await database.media.bulkGet(pictures.map((p) => p.id))
        await database.media.bulkPut(pictures.filter((_, i) => !have[i]).map((p) => ({ ...p, createdAt: now })))
      })
    },

    async storedPictures(ids) {
      const rows = await database.media.bulkGet([...ids])
      return new Set(rows.flatMap((r) => (r ? [r.id] : [])))
    },

    async nextDeckOrder() {
      return nextOrder(await database.decks.filter(isActive).toArray())
    },
  }
}

/** A deck as publishing reads it: its lessons, its cards, and their pictures' bytes. */
export async function publishSource(deckId: Id, database: AppDB = defaultDb): Promise<PublishSource | undefined> {
  const deck = await database.decks.get(deckId)
  if (!deck || !isActive(deck)) return undefined
  const [lessons, cards] = await Promise.all([
    database.lessons.where('deckId').equals(deckId).filter(isActive).toArray(),
    database.cards.filter((c) => c.deckId === deckId && isActive(c)).toArray(),
  ])
  return {
    deck,
    lessons,
    cards,
    async picture(id) {
      const media = await database.media.get(id)
      return media && { data: new Uint8Array(await media.blob.arrayBuffer()), mime: media.mime, width: media.width, height: media.height }
    },
  }
}

/** Record (or, with undefined, forget) where a deck is shared; the teacher's other devices get it through sync. */
export async function saveShare(deckId: Id, share: DeckShare | undefined, now = Date.now()): Promise<void> {
  await defaultDb.transaction('rw', defaultDb.decks, async () => {
    const deck = await defaultDb.decks.get(deckId)
    if (!deck) return
    const { share: _old, ...rest } = deck
    await defaultDb.decks.put({ ...rest, ...(share ? { share } : {}), updatedAt: now })
  })
}

/** Set the teacher's name students see (empty = none). */
export async function setTeacherName(deckId: Id, teacher: string, now = Date.now()): Promise<void> {
  const deck = await defaultDb.decks.get(deckId)
  if (!deck) return
  const { teacher: _old, ...rest } = deck
  const name = teacher.trim()
  await defaultDb.decks.put({ ...rest, ...(name ? { teacher: name } : {}), updatedAt: now })
}

/** Show or hide a lesson from students. */
export async function setLessonHidden(lessonId: Id, hidden: boolean, now = Date.now()): Promise<void> {
  const lesson = await defaultDb.lessons.get(lessonId)
  if (!lesson) return
  const { hidden: _old, ...rest } = lesson
  await defaultDb.lessons.put({ ...rest, ...(hidden ? { hidden: true } : {}), updatedAt: now })
}

/**
 * A joined class becomes an ordinary deck of this user: no more teacher updates, and its lessons and cards
 * (with their progress and pictures) can be edited and shared like any deck.
 */
export async function ownDeck(deckId: Id, database: AppDB = defaultDb, now = Date.now()): Promise<void> {
  await database.transaction('rw', database.decks, async () => {
    const deck = await database.decks.get(deckId)
    if (!deck?.remote) return
    const { remote: _remote, ...rest } = deck
    await database.decks.put({ ...rest, updatedAt: now })
  })
}
