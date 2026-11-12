import { newId } from '@/domain/ids'
import { byOrder, isActive, MY_CARDS, nextOrder, titleKey } from '@/domain/library'
import type { Card, Deck, Id, Lesson } from '@/domain/types'
import { db } from '../db'

/** What happens to a removed deck's or lesson's cards: deleted, or kept (in My cards / the deck). */
export type RemoveCards = 'delete' | 'keep'

const clean = (s: string) => s.trim().replace(/\s+/g, ' ')

/** Active decks in list order. */
export async function listDecks(): Promise<Deck[]> {
  return (await db.decks.filter(isActive).toArray()).sort(byOrder)
}

export async function getDeck(id: Id): Promise<Deck | undefined> {
  const deck = await db.decks.get(id)
  return deck && isActive(deck) ? deck : undefined
}

/** Active lessons in order: of one deck, or of all decks. */
export async function listLessons(deckId?: Id): Promise<Lesson[]> {
  const rows = deckId === undefined ? await db.lessons.toArray() : await db.lessons.where('deckId').equals(deckId).toArray()
  return rows.filter(isActive).sort(byOrder)
}

export async function createDeck(title: string, now = Date.now()): Promise<Deck> {
  return db.transaction('rw', db.decks, async () => {
    const deck: Deck = { id: newId(), title: clean(title) || 'New deck', order: nextOrder(await listDecks()), createdAt: now, updatedAt: now }
    await db.decks.add(deck)
    return deck
  })
}

export async function updateDeck(id: Id, fields: { title?: string; description?: string }, now = Date.now()): Promise<void> {
  const deck = await getDeck(id)
  if (!deck) return
  const title = fields.title === undefined ? deck.title : clean(fields.title) || deck.title
  const description = fields.description === undefined ? deck.description : fields.description.trim() || undefined
  const { description: _old, ...rest } = deck
  await db.decks.put({ ...rest, title, ...(description ? { description } : {}), updatedAt: now })
}

/** Lessons titled like these (reused) or new ones at the end, in the given order. Keys are {@link titleKey}s. */
export async function ensureLessons(deckId: Id, titles: readonly string[], now = Date.now()): Promise<Map<string, Lesson>> {
  return db.transaction('rw', db.lessons, async () => {
    const existing = await listLessons(deckId)
    const byKey = new Map(existing.map((l) => [titleKey(l.title), l]))
    let order = nextOrder(existing)
    const added: Lesson[] = []
    for (const title of titles) {
      const key = titleKey(title)
      if (!key || byKey.has(key)) continue
      // Increasing createdAt keeps ties in the given order.
      const lesson: Lesson = { id: newId(), deckId, title: clean(title), order: order++, createdAt: now + added.length, updatedAt: now }
      added.push(lesson)
      byKey.set(key, lesson)
    }
    await db.lessons.bulkAdd(added)
    return byKey
  })
}

export async function createLesson(deckId: Id, title: string, now = Date.now()): Promise<Lesson> {
  return db.transaction('rw', db.lessons, async () => {
    const lesson: Lesson = { id: newId(), deckId, title: clean(title) || 'New lesson', order: nextOrder(await listLessons(deckId)), createdAt: now, updatedAt: now }
    await db.lessons.add(lesson)
    return lesson
  })
}

export async function renameLesson(id: Id, title: string, now = Date.now()): Promise<void> {
  const t = clean(title)
  if (t) await db.lessons.update(id, { title: t, updatedAt: now })
}

/** Swap a deck or lesson with its neighbour (-1 = up, 1 = down); orders are renumbered 0..n-1. */
async function move<T extends Deck | Lesson>(rows: T[], id: Id, by: -1 | 1, write: (changed: T[]) => Promise<unknown>, now: number) {
  const i = rows.findIndex((r) => r.id === id)
  const j = i + by
  if (i < 0 || j < 0 || j >= rows.length) return
  const next = [...rows]
  ;[next[i], next[j]] = [next[j]!, next[i]!]
  await write(next.flatMap((r, order) => (r.order === order ? [] : [{ ...r, order, updatedAt: now }])))
}

export async function moveDeck(id: Id, by: -1 | 1, now = Date.now()): Promise<void> {
  await db.transaction('rw', db.decks, async () => move(await listDecks(), id, by, (rows) => db.decks.bulkPut(rows), now))
}

export async function moveLesson(id: Id, by: -1 | 1, now = Date.now()): Promise<void> {
  await db.transaction('rw', db.lessons, async () => {
    const lesson = await db.lessons.get(id)
    if (lesson) await move(await listLessons(lesson.deckId), id, by, (rows) => db.lessons.bulkPut(rows), now)
  })
}

/** A card moved to `deckId` / `lessonId` (no lesson when undefined). */
function placed(card: Card, deckId: Id, lessonId: Id | undefined, now: number): Card {
  const { lessonId: _old, ...rest } = card
  return { ...rest, deckId, ...(lessonId ? { lessonId } : {}), updatedAt: now }
}

/** Soft delete: sync carries it to other devices. Its cards are deleted, or kept in My cards. */
export async function deleteDeck(id: Id, cards: RemoveCards, now = Date.now()): Promise<void> {
  await db.transaction('rw', db.decks, db.lessons, db.cards, async () => {
    await db.decks.update(id, { deletedAt: now, updatedAt: now })
    const lessons = await db.lessons.where('deckId').equals(id).filter(isActive).toArray()
    await db.lessons.bulkPut(lessons.map((l) => ({ ...l, deletedAt: now, updatedAt: now })))
    const rows = await db.cards.filter((c) => isActive(c) && c.deckId === id).toArray()
    await db.cards.bulkPut(rows.map((c) => (cards === 'delete' ? { ...c, deletedAt: now, updatedAt: now } : placed(c, MY_CARDS, undefined, now))))
  })
}

/** Soft delete. Its cards are deleted, or stay in the deck without a lesson. */
export async function deleteLesson(id: Id, cards: RemoveCards, now = Date.now()): Promise<void> {
  await db.transaction('rw', db.lessons, db.cards, async () => {
    const lesson = await db.lessons.get(id)
    if (!lesson) return
    await db.lessons.put({ ...lesson, deletedAt: now, updatedAt: now })
    const rows = await db.cards.filter((c) => isActive(c) && c.lessonId === id).toArray()
    await db.cards.bulkPut(rows.map((c) => (cards === 'delete' ? { ...c, deletedAt: now, updatedAt: now } : placed(c, lesson.deckId, undefined, now))))
  })
}

/** Put cards in a deck (or My cards) and optionally a lesson of it. Returns how many changed. */
export async function moveCards(ids: readonly Id[], deckId: Id, lessonId?: Id, now = Date.now()): Promise<number> {
  return db.transaction('rw', db.cards, async () => {
    const rows = (await db.cards.bulkGet([...ids])).filter((c): c is Card => !!c && isActive(c))
    const changed = rows.filter((c) => c.deckId !== deckId || c.lessonId !== lessonId)
    await db.cards.bulkPut(changed.map((c) => placed(c, deckId, deckId === MY_CARDS ? undefined : lessonId, now)))
    return changed.length
  })
}
