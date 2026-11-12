import { beforeEach, describe, expect, it } from 'vitest'
import { ALL_TABLES, db } from '../db'
import { createCard, createCards } from './cards'
import { createDeck, createLesson, deleteDeck, deleteLesson, ensureLessons, listDecks, listLessons, moveCards, moveDeck, moveLesson, updateDeck } from './decks'

beforeEach(async () => {
  await Promise.all(ALL_TABLES().map((t) => t.clear()))
})

describe('decks', () => {
  it('are listed in order, new ones last', async () => {
    await createDeck('Book 1', 1000)
    await createDeck('  Night   class ', 2000)
    expect((await listDecks()).map((d) => d.title)).toEqual(['Book 1', 'Night class'])
  })

  it('move up and down', async () => {
    const a = await createDeck('A', 1000)
    await createDeck('B', 1001)
    await createDeck('C', 1002)
    await moveDeck(a.id, 1, 2000)
    expect((await listDecks()).map((d) => d.title)).toEqual(['B', 'A', 'C'])
    await moveDeck(a.id, -1, 3000)
    await moveDeck(a.id, -1, 3001) // already first
    expect((await listDecks()).map((d) => d.title)).toEqual(['A', 'B', 'C'])
  })

  it('rename, and keep the title when the new one is blank', async () => {
    const deck = await createDeck('Book 1', 1000)
    await updateDeck(deck.id, { title: 'Book 2', description: 'Spring term' }, 2000)
    await updateDeck(deck.id, { title: '   ' }, 3000)
    expect((await listDecks())[0]).toMatchObject({ title: 'Book 2', description: 'Spring term', updatedAt: 3000 })
  })

  it('deleted with their cards, or keeping them in My cards', async () => {
    const a = await createDeck('A', 1000)
    const b = await createDeck('B', 1000)
    const lesson = await createLesson(b.id, 'L1', 1000)
    const inA = await createCard({ hanzi: '一', pinyin: 'yī', deckId: a.id }, 1001)
    const inB = await createCard({ hanzi: '二', pinyin: 'èr', deckId: b.id, lessonId: lesson.id }, 1002)

    await deleteDeck(a.id, 'delete', 2000)
    expect((await db.cards.get(inA.id))?.deletedAt).toBe(2000)

    await deleteDeck(b.id, 'keep', 3000)
    const kept = await db.cards.get(inB.id)
    expect(kept).toMatchObject({ deckId: 'default', updatedAt: 3000 })
    expect(kept?.deletedAt).toBeUndefined()
    expect(kept && 'lessonId' in kept).toBe(false)
    expect((await db.lessons.get(lesson.id))?.deletedAt).toBe(3000)
    expect(await listDecks()).toEqual([])
  })
})

describe('lessons', () => {
  it('reuse a lesson with the same title and add the rest in order', async () => {
    const deck = await createDeck('Class', 1000)
    await createLesson(deck.id, 'Lesson 1', 1000)
    const map = await ensureLessons(deck.id, ['Lesson 2', ' lesson  1', 'Lesson 3', 'Lesson 2', ''], 2000)
    expect((await listLessons(deck.id)).map((l) => l.title)).toEqual(['Lesson 1', 'Lesson 2', 'Lesson 3'])
    expect(map.get('lesson 1')?.createdAt).toBe(1000)
    expect([...map.keys()]).toEqual(['lesson 1', 'lesson 2', 'lesson 3'])
  })

  it('belong to their own deck', async () => {
    const a = await createDeck('A', 1000)
    const b = await createDeck('B', 1000)
    await ensureLessons(a.id, ['L1'], 1000)
    await ensureLessons(b.id, ['L1', 'L2'], 1000)
    expect(await listLessons(a.id)).toHaveLength(1)
    expect(await listLessons()).toHaveLength(3)
  })

  it('move, and deleting one keeps or deletes its cards', async () => {
    const deck = await createDeck('Class', 1000)
    const map = await ensureLessons(deck.id, ['L1', 'L2'], 1000)
    await moveLesson(map.get('l2')!.id, -1, 2000)
    expect((await listLessons(deck.id)).map((l) => l.title)).toEqual(['L2', 'L1'])

    const [one, two] = await createCards(
      [
        { hanzi: '一', pinyin: 'yī', deckId: deck.id, lessonId: map.get('l1')!.id },
        { hanzi: '二', pinyin: 'èr', deckId: deck.id, lessonId: map.get('l2')!.id },
      ],
      3000,
    )
    await deleteLesson(map.get('l1')!.id, 'keep', 4000)
    const kept = await db.cards.get(one!.id)
    expect(kept?.deckId).toBe(deck.id)
    expect(kept && 'lessonId' in kept).toBe(false)
    await deleteLesson(map.get('l2')!.id, 'delete', 5000)
    expect((await db.cards.get(two!.id))?.deletedAt).toBe(5000)
    expect(await listLessons(deck.id)).toEqual([])
  })
})

describe('moveCards', () => {
  it('moves cards into a lesson, and back to My cards without a lesson', async () => {
    const deck = await createDeck('Class', 1000)
    const lesson = await createLesson(deck.id, 'L1', 1000)
    const cards = await createCards(
      [
        { hanzi: '一', pinyin: 'yī' },
        { hanzi: '二', pinyin: 'èr' },
      ],
      1000,
    )
    const ids = cards.map((c) => c.id)
    expect(await moveCards(ids, deck.id, lesson.id, 2000)).toBe(2)
    expect(await moveCards(ids, deck.id, lesson.id, 2500)).toBe(0)
    expect((await db.cards.get(ids[0]!))).toMatchObject({ deckId: deck.id, lessonId: lesson.id, updatedAt: 2000 })

    await moveCards(ids, 'default', lesson.id, 3000)
    const back = await db.cards.get(ids[1]!)
    expect(back?.deckId).toBe('default')
    expect(back && 'lessonId' in back).toBe(false)
  })
})
